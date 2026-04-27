/**
 * Plugin tools — list registered plugins and invoke them.
 *
 * The registration function fetches the live plugin manifest at registration
 * time so that Claude sees plugin-specific descriptions (excel-connector,
 * csv-connector, excel-exporter, etc.) in the tool description.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient, PluginManifest } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

export async function registerPluginTools(
	server: McpServer,
	client: McpHolocronClient,
): Promise<void> {
	let manifests: PluginManifest[] = [];
	try {
		manifests = await client.listPlugins();
	} catch (err) {
		// Non-fatal — we still register the tool with a generic description.
		console.error(
			`[mcp-server] Warning: could not fetch plugin manifests at startup: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}

	server.registerTool(
		"list_plugins",
		{
			title: "List Plugins",
			description:
				"List all registered Holocron plugins (import connectors and exporters). Returns each plugin's slug, name, capability (import/export), and input spec.",
			inputSchema: {},
		},
		async (): Promise<CallToolResult> => {
			try {
				const plugins = await client.listPlugins();
				return jsonResult({ plugins });
			} catch (err) {
				return errorResult("list_plugins", err);
			}
		},
	);

	const runDescription = buildRunPluginDescription(manifests);

	server.registerTool(
		"run_plugin",
		{
			title: "Run Plugin",
			description: runDescription,
			inputSchema: {
				slug: z
					.string()
					.min(1)
					.describe(
						"Plugin slug (see list_plugins). Known: excel-connector, csv-connector, excel-exporter.",
					),
				inputs: z
					.record(z.unknown())
					.optional()
					.describe(
						"Input map for the plugin. File inputs accept a host path (e.g. `/data/catalog.xlsx`) and are read from disk and multipart-encoded. Pass `{}` or omit for plugins with no inputs.",
					),
			},
		},
		async ({ slug, inputs }): Promise<CallToolResult> => {
			try {
				const result = await client.runPlugin(slug, inputs ?? {});
				if (result.kind === "download" && result.download) {
					const { filename, contentType, base64, sizeBytes } = result.download;
					return jsonResult({
						kind: "download",
						filename,
						contentType,
						sizeBytes,
						base64Preview: `${base64.slice(0, 64)}…`,
						base64,
					});
				}
				return jsonResult({ kind: "summary", summary: result.summary });
			} catch (err) {
				return errorResult("run_plugin", err);
			}
		},
	);
}

function buildRunPluginDescription(manifests: PluginManifest[]): string {
	const lines: string[] = [
		"Execute a Holocron plugin (import connector or exporter).",
		"File inputs accept a host path (string) and are read and multipart-encoded for you.",
		"- Import plugins discover assets/actors/relations and push them as unverified.",
		"- Export plugins return a downloadable payload (base64-encoded in the response).",
	];

	if (manifests.length) {
		lines.push("", "Registered plugins:");
		for (const m of manifests) {
			const inputSummary = m.inputs.length
				? m.inputs
						.map(
							(i) =>
								`${i.name}:${i.type}${i.required ? " (required)" : ""}${
									i.accept ? ` [${i.accept}]` : ""
								}`,
						)
						.join(", ")
				: "no inputs";
			lines.push(`- \`${m.slug}\` (${m.capability}): ${m.description} — inputs: ${inputSummary}`);
		}
	} else {
		lines.push(
			"",
			"Known plugin slugs: `excel-connector` (file: xlsx/xlsm/xltx), `csv-connector` (file: csv/tsv/txt), `excel-exporter` (no inputs, returns a base64-encoded .xlsx).",
		);
	}

	return lines.join("\n");
}
