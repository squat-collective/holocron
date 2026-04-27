/**
 * Plugin types + UI-side helpers.
 *
 * Mirrors the API's plugin contract from
 * `packages/api/src/holocron/plugins/base.py`. Kept as a small local copy
 * rather than reaching into the SDK's OpenAPI `components` because the
 * SDK does not re-export them as named types — and the manifest shape is
 * stable enough that an authoritative-looking duplicate is cheaper than
 * threading the indirection.
 */

export type PluginCapability = "import" | "export";
export type PluginInputType = "file" | "string" | "boolean";

export interface PluginInputSpec {
	name: string;
	type: PluginInputType;
	label: string;
	description?: string | null;
	/** Comma-separated MIME / extension whitelist for file inputs. */
	accept?: string | null;
	required: boolean;
	default?: unknown;
}

export interface PluginManifest {
	slug: string;
	name: string;
	description: string;
	icon: string;
	version: string;
	capability: PluginCapability;
	inputs?: PluginInputSpec[];
	/** Where to send the user after an IMPORT run to triage the unverified
	 *  records the plugin pushed. Empty/null when irrelevant (EXPORTs). */
	review_link?: string | null;
}

/** Shape returned by IMPORT runs. Mirrors `SummaryResult` in
 *  `packages/api/src/holocron/plugins/base.py`. */
export interface PluginSummaryResult {
	title: string;
	counts: Record<string, number>;
	samples: Array<Record<string, unknown>>;
	extra?: Record<string, unknown>;
}

/** Filename helper — pulls `filename="..."` out of a Content-Disposition
 *  header. Falls back to a slug-based default when the server didn't set
 *  one. */
export function filenameFromContentDisposition(
	header: string | null,
	fallback: string,
): string {
	if (!header) return fallback;
	const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
	return m?.[1] ?? fallback;
}
