/**
 * Thin wrapper around the Holocron SDK plus a few raw endpoints the SDK
 * doesn't yet surface (plugins, verified flag).
 *
 * The public entrypoint is `createHolocronMcpClient`, which returns a
 * combined client used by every tool handler.
 */
import { HolocronClient } from "@squat-collective/holocron-ts";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

/**
 * Options for constructing the MCP Holocron client.
 */
export interface McpClientOptions {
	/** Base URL of the Holocron API, e.g. `http://localhost:8100`. */
	baseUrl: string;
	/** Optional bearer token for auth. */
	token?: string;
}

/**
 * Plugin input spec returned by the API.
 */
export interface PluginInputSpec {
	name: string;
	type: "file" | "string" | "number" | "boolean" | string;
	label?: string;
	description?: string;
	accept?: string;
	required?: boolean;
	default?: unknown;
}

/**
 * Plugin manifest as returned by the API.
 */
export interface PluginManifest {
	slug: string;
	name: string;
	description: string;
	icon?: string;
	version?: string;
	capability: "import" | "export" | string;
	inputs: PluginInputSpec[];
	review_link?: string | null;
}

/**
 * Combined result from running a plugin.
 * - Summary plugins return a JSON payload under `summary`.
 * - Download plugins stream a file, captured here as base64 under `download`.
 */
export interface PluginRunResult {
	kind: "summary" | "download";
	/** JSON body for summary-style plugins. */
	summary?: unknown;
	/** Download attachment (base64-encoded). */
	download?: {
		filename: string;
		contentType: string;
		base64: string;
		sizeBytes: number;
	};
}

/**
 * Rule payload as returned by the API. Mirrored here because the SDK
 * does not (yet) surface a `client.rules` resource — once it does,
 * swap raw fetches in this file for typed calls and remove this type.
 */
export interface RuleRecord {
	uid: string;
	name: string;
	description: string;
	severity: "info" | "warning" | "critical";
	category: string | null;
	verified: boolean;
	discovered_by: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface AppliedRuleRecord {
	rule: RuleRecord;
	relation_uid: string;
	enforcement: "enforced" | "alerting" | "documented" | null;
	field_path: string | null;
	note: string | null;
	properties: Record<string, unknown>;
}

/**
 * Combined Holocron MCP client: the typed SDK plus a small raw-fetch helper
 * for endpoints the SDK doesn't wrap yet.
 */
export interface McpHolocronClient {
	/** Typed SDK for assets, actors, relations, events. */
	sdk: HolocronClient;
	/** Resolved base URL (no trailing slash). */
	baseUrl: string;
	/** List registered plugins. */
	listPlugins(): Promise<PluginManifest[]>;
	/** Run a plugin with the given inputs (file paths are read from disk). */
	runPlugin(slug: string, inputs: Record<string, unknown>): Promise<PluginRunResult>;
	/** Mark an asset as verified/unverified (and optionally append a note). */
	setAssetVerified(uid: string, verified: boolean, description?: string): Promise<unknown>;
	/** Mark an actor as verified/unverified. */
	setActorVerified(uid: string, verified: boolean, description?: string): Promise<unknown>;
	/** Mark a relation as verified/unverified. The API does not expose a
	 * dedicated endpoint, so this re-creates the relation with `verified: true`
	 * if needed. For now, we simply return the relation (a no-op) and surface
	 * a note to the caller. */
	setRelationVerified(uid: string): Promise<unknown>;
	/** Fetch a single relation by UID (SDK does not expose this yet). */
	getRelation(uid: string): Promise<unknown>;

	// ----- Data-quality rules (SDK has no rules support yet) -----
	listRules(params?: {
		category?: string;
		severity?: string;
		limit?: number;
		offset?: number;
	}): Promise<{ items: RuleRecord[]; total: number }>;
	getRule(uid: string): Promise<RuleRecord>;
	createRule(
		payload: Partial<RuleRecord> & { name: string; description: string },
	): Promise<RuleRecord>;
	updateRule(uid: string, patch: Partial<RuleRecord>): Promise<RuleRecord>;
	deleteRule(uid: string): Promise<void>;
	/** List rules applied to an asset with enforcement context. */
	listRulesForAsset(assetUid: string): Promise<AppliedRuleRecord[]>;
	/** Attach a rule to an asset via APPLIES_TO with enforcement + optional field_path + note. */
	attachRule(params: {
		ruleUid: string;
		assetUid: string;
		enforcement: "enforced" | "alerting" | "documented";
		fieldPath?: string;
		note?: string;
	}): Promise<unknown>;
	/** Detach a rule from an asset by deleting the APPLIES_TO relation. */
	detachRule(relationUid: string): Promise<void>;
}

function joinUrl(base: string, path: string): string {
	const trimmed = base.replace(/\/+$/, "");
	const suffix = path.startsWith("/") ? path : `/${path}`;
	return `${trimmed}${suffix}`;
}

function buildAuthHeaders(token: string | undefined): HeadersInit {
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

/**
 * Create the combined MCP client.
 */
export function createHolocronMcpClient(options: McpClientOptions): McpHolocronClient {
	const baseUrl = options.baseUrl.replace(/\/+$/, "");
	const sdk = new HolocronClient({ baseUrl });

	async function request(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		const auth = buildAuthHeaders(options.token);
		for (const [k, v] of Object.entries(auth)) headers.set(k, v);
		const res = await fetch(joinUrl(baseUrl, path), { ...init, headers });
		return res;
	}

	async function listPlugins(): Promise<PluginManifest[]> {
		const res = await request("/api/v1/plugins", { method: "GET" });
		if (!res.ok) {
			throw new Error(`Failed to list plugins: ${res.status} ${res.statusText}`);
		}
		const data = (await res.json()) as { plugins: PluginManifest[] };
		return data.plugins ?? [];
	}

	async function runPlugin(
		slug: string,
		inputs: Record<string, unknown>,
	): Promise<PluginRunResult> {
		// Build multipart form. File inputs are strings holding a host path.
		const form = new FormData();
		for (const [key, value] of Object.entries(inputs ?? {})) {
			if (value === undefined || value === null) continue;
			if (typeof value === "string" && looksLikeFilePath(value)) {
				const bytes = await readFile(value);
				const blob = new Blob([new Uint8Array(bytes)]);
				form.append(key, blob, basename(value));
			} else if (value instanceof Uint8Array) {
				form.append(key, new Blob([new Uint8Array(value)]));
			} else {
				form.append(key, String(value));
			}
		}

		const res = await request(`/api/v1/plugins/${encodeURIComponent(slug)}/run`, {
			method: "POST",
			body: form,
		});

		if (!res.ok) {
			const text = await safeText(res);
			throw new Error(`Plugin ${slug} run failed: ${res.status} ${res.statusText} ${text}`);
		}

		const contentType = res.headers.get("content-type") ?? "";
		const disposition = res.headers.get("content-disposition") ?? "";
		if (disposition.toLowerCase().includes("attachment")) {
			const buf = new Uint8Array(await res.arrayBuffer());
			const filename = extractFilename(disposition) ?? `${slug}-output`;
			return {
				kind: "download",
				download: {
					filename,
					contentType: contentType || "application/octet-stream",
					base64: Buffer.from(buf).toString("base64"),
					sizeBytes: buf.byteLength,
				},
			};
		}

		const summary = await res.json();
		return { kind: "summary", summary };
	}

	async function putJson(path: string, body: unknown): Promise<unknown> {
		const res = await request(path, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const text = await safeText(res);
			throw new Error(`PUT ${path} failed: ${res.status} ${res.statusText} ${text}`);
		}
		return res.json();
	}

	return {
		sdk,
		baseUrl,
		listPlugins,
		runPlugin,
		setAssetVerified: async (uid, verified, description) =>
			putJson(`/api/v1/assets/${encodeURIComponent(uid)}`, {
				verified,
				...(description !== undefined ? { description } : {}),
			}),
		setActorVerified: async (uid, verified, description) =>
			putJson(`/api/v1/actors/${encodeURIComponent(uid)}`, {
				verified,
				...(description !== undefined ? { description } : {}),
			}),
		setRelationVerified: async (uid) => {
			// The API has no PUT /relations/{uid}. Relations created through the API
			// default to `verified: true`; relations discovered by plugins are
			// unverified. As a workaround, we simply fetch it (if possible) and
			// surface the current state — verifying after discovery requires a
			// backend endpoint that doesn't exist yet.
			const res = await request(`/api/v1/relations/${encodeURIComponent(uid)}`, {
				method: "GET",
			});
			if (!res.ok) throw new Error(`Unable to inspect relation ${uid}`);
			const relation = await res.json();
			return {
				relation,
				note: "Manual relation verification is not supported by the API yet (no PUT /relations/{uid}). Relations created via create_relation are verified by default.",
			};
		},
		getRelation: async (uid) => {
			const res = await request(`/api/v1/relations/${encodeURIComponent(uid)}`, {
				method: "GET",
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(`get relation ${uid} failed: ${res.status} ${res.statusText} ${text}`);
			}
			return res.json();
		},

		// ----- Rules -----
		listRules: async (params = {}) => {
			const qs = new URLSearchParams();
			if (params.category) qs.set("category", params.category);
			if (params.severity) qs.set("severity", params.severity);
			if (params.limit !== undefined) qs.set("limit", String(params.limit));
			if (params.offset !== undefined) qs.set("offset", String(params.offset));
			const suffix = qs.toString() ? `?${qs}` : "";
			const res = await request(`/api/v1/rules${suffix}`, { method: "GET" });
			if (!res.ok) throw new Error(`listRules failed: ${res.status} ${res.statusText}`);
			return res.json();
		},
		getRule: async (uid) => {
			const res = await request(`/api/v1/rules/${encodeURIComponent(uid)}`, {
				method: "GET",
			});
			if (!res.ok) throw new Error(`getRule failed: ${res.status} ${res.statusText}`);
			return res.json();
		},
		createRule: async (payload) => {
			const res = await request("/api/v1/rules", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(`createRule failed: ${res.status} ${res.statusText} ${text}`);
			}
			return res.json();
		},
		updateRule: async (uid, patch) => {
			const res = await request(`/api/v1/rules/${encodeURIComponent(uid)}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(`updateRule failed: ${res.status} ${res.statusText} ${text}`);
			}
			return res.json();
		},
		deleteRule: async (uid) => {
			const res = await request(`/api/v1/rules/${encodeURIComponent(uid)}`, {
				method: "DELETE",
			});
			if (!res.ok && res.status !== 204) {
				throw new Error(`deleteRule failed: ${res.status} ${res.statusText}`);
			}
		},
		listRulesForAsset: async (assetUid) => {
			const res = await request(
				`/api/v1/rules/for-asset/${encodeURIComponent(assetUid)}`,
				{ method: "GET" },
			);
			if (!res.ok)
				throw new Error(`listRulesForAsset failed: ${res.status} ${res.statusText}`);
			const data = (await res.json()) as { items: AppliedRuleRecord[] };
			return data.items ?? [];
		},
		attachRule: async ({ ruleUid, assetUid, enforcement, fieldPath, note }) => {
			const properties: Record<string, unknown> = { enforcement };
			if (fieldPath) properties.field_path = fieldPath;
			if (note) properties.note = note;
			const res = await request("/api/v1/relations", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					from_uid: ruleUid,
					to_uid: assetUid,
					type: "applies_to",
					verified: true,
					properties,
				}),
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(`attachRule failed: ${res.status} ${res.statusText} ${text}`);
			}
			return res.json();
		},
		detachRule: async (relationUid) => {
			const res = await request(`/api/v1/relations/${encodeURIComponent(relationUid)}`, {
				method: "DELETE",
			});
			if (!res.ok && res.status !== 204) {
				throw new Error(`detachRule failed: ${res.status} ${res.statusText}`);
			}
		},
	};
}

function looksLikeFilePath(value: string): boolean {
	// Heuristic: treat as path if it contains / or \ and doesn't look like a URL.
	if (/^https?:\/\//.test(value)) return false;
	return value.includes("/") || value.includes("\\");
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}

function extractFilename(disposition: string): string | null {
	const match =
		/filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename="?([^";]+)"?/i.exec(disposition);
	if (!match?.[1]) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}
