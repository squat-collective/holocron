/**
 * Rule tools — document data-quality contracts, attach them to assets with
 * enforcement context (enforced / alerting / documented).
 *
 * A Rule describes WHAT data should respect (name, description, severity,
 * category). The enforcement tier — whether that rule is actively checked,
 * only alerting, or just documented — lives on the APPLIES_TO relation, so
 * the same rule can be `enforced` on prod while only `documented` on legacy.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

const SEVERITIES = ["info", "warning", "critical"] as const;
const ENFORCEMENTS = ["enforced", "alerting", "documented"] as const;

const SeveritySchema = z.enum(SEVERITIES);
const EnforcementSchema = z.enum(ENFORCEMENTS);

export function registerRuleTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"list_rules",
		{
			title: "List Rules",
			description:
				"List data-quality rules in the catalog. Rules describe what data should respect (e.g. 'Prices must be positive', 'No PII in analytics'). Optionally filter by category or severity.",
			inputSchema: {
				category: z.string().optional().describe("Filter by category tag, e.g. 'privacy'"),
				severity: SeveritySchema.optional(),
				limit: z.number().int().min(1).max(100).optional(),
				offset: z.number().int().min(0).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const data = await client.listRules({
					category: args.category,
					severity: args.severity,
					limit: args.limit,
					offset: args.offset,
				});
				return jsonResult({
					total: data.total,
					items: data.items.map((r) => ({
						uid: r.uid,
						name: r.name,
						severity: r.severity,
						category: r.category,
					})),
				});
			} catch (err) {
				return errorResult("list_rules", err);
			}
		},
	);

	server.registerTool(
		"get_rule",
		{
			title: "Get Rule",
			description:
				"Fetch a single rule by UID — returns full name, description, severity, category.",
			inputSchema: { uid: z.string().min(1) },
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				return jsonResult(await client.getRule(uid));
			} catch (err) {
				return errorResult("get_rule", err);
			}
		},
	);

	server.registerTool(
		"create_rule",
		{
			title: "Create Rule",
			description:
				"Create a new data-quality rule. Rules are shareable across assets — create once, attach to many. Severity is inherent to the rule; the enforcement tier (how strictly it's checked) lives on the APPLIES_TO relation, set via attach_rule.",
			inputSchema: {
				name: z
					.string()
					.min(1)
					.max(255)
					.describe("Short identifier, e.g. 'Prices must be positive'"),
				description: z
					.string()
					.min(1)
					.describe("Plain-English explanation of what data should respect"),
				severity: SeveritySchema.optional().describe(
					"How bad a violation is — info (default warning), warning, critical",
				),
				category: z
					.string()
					.max(100)
					.nullable()
					.optional()
					.describe("Optional tag grouping, e.g. 'privacy', 'freshness', 'integrity'"),
				metadata: z.record(z.unknown()).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const created = await client.createRule({
					name: args.name,
					description: args.description,
					severity: args.severity ?? "warning",
					category: args.category ?? null,
					metadata: args.metadata ?? {},
				});
				return jsonResult(created);
			} catch (err) {
				return errorResult("create_rule", err);
			}
		},
	);

	server.registerTool(
		"update_rule",
		{
			title: "Update Rule",
			description:
				"Partial update of an existing rule (name, description, severity, category). Any field you omit stays untouched. Pass `verified: true` to confirm a discovered rule.",
			inputSchema: {
				uid: z.string().min(1),
				name: z.string().min(1).max(255).optional(),
				description: z.string().optional(),
				severity: SeveritySchema.optional(),
				category: z.string().max(100).nullable().optional(),
				verified: z.boolean().optional(),
				metadata: z.record(z.unknown()).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const { uid, ...patch } = args;
				return jsonResult(await client.updateRule(uid, patch));
			} catch (err) {
				return errorResult("update_rule", err);
			}
		},
	);

	server.registerTool(
		"delete_rule",
		{
			title: "Delete Rule",
			description:
				"Delete a rule by UID. This also detaches it from every asset it was applied to (via APPLIES_TO relation cascade).",
			inputSchema: { uid: z.string().min(1) },
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				await client.deleteRule(uid);
				return jsonResult({ uid, deleted: true });
			} catch (err) {
				return errorResult("delete_rule", err);
			}
		},
	);

	server.registerTool(
		"list_rules_for_asset",
		{
			title: "List Rules Applied to an Asset",
			description:
				"List all rules attached to a specific asset with their per-asset enforcement context (enforced / alerting / documented), optional field_path targeting, and any note. Use this to understand what constraints the asset is documented to respect.",
			inputSchema: { asset_uid: z.string().min(1).describe("Asset UID") },
		},
		async ({ asset_uid }): Promise<CallToolResult> => {
			try {
				const items = await client.listRulesForAsset(asset_uid);
				return jsonResult({
					total: items.length,
					items: items.map((item) => ({
						rule_uid: item.rule.uid,
						rule_name: item.rule.name,
						severity: item.rule.severity,
						category: item.rule.category,
						enforcement: item.enforcement,
						field_path: item.field_path,
						note: item.note,
						relation_uid: item.relation_uid,
					})),
				});
			} catch (err) {
				return errorResult("list_rules_for_asset", err);
			}
		},
	);

	server.registerTool(
		"attach_rule",
		{
			title: "Attach Rule to Asset",
			description:
				"Attach an existing rule to an asset with an enforcement tier. Enforcement is per-relation: the same rule can be `enforced` on prod and `documented` on legacy. Optionally target a specific part of the asset via field_path (e.g. 'Customers/CustomersTable/email') — omit to apply to the whole asset.",
			inputSchema: {
				rule_uid: z.string().min(1).describe("UID of an existing rule"),
				asset_uid: z.string().min(1).describe("UID of the asset to attach the rule to"),
				enforcement: EnforcementSchema.describe(
					"enforced = actively checked, blocks on failure; alerting = checked, alerts but doesn't block; documented = written down, no check in place yet",
				),
				field_path: z
					.string()
					.optional()
					.describe(
						"Slash-joined path into the asset's schema, e.g. 'Customers/CustomersTable/email'. Omit to apply to the whole asset.",
					),
				note: z
					.string()
					.optional()
					.describe("Free-text note, e.g. 'Runner: Great Expectations check #42'"),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const rel = await client.attachRule({
					ruleUid: args.rule_uid,
					assetUid: args.asset_uid,
					enforcement: args.enforcement,
					fieldPath: args.field_path,
					note: args.note,
				});
				return jsonResult(rel);
			} catch (err) {
				return errorResult("attach_rule", err);
			}
		},
	);

	server.registerTool(
		"detach_rule",
		{
			title: "Detach Rule from Asset",
			description:
				"Remove an APPLIES_TO relation between a rule and an asset. The rule itself remains in the catalog and may still be attached to other assets. Pass the relation_uid (get it from list_rules_for_asset).",
			inputSchema: {
				relation_uid: z
					.string()
					.min(1)
					.describe("UID of the APPLIES_TO relation (from list_rules_for_asset)"),
			},
		},
		async ({ relation_uid }): Promise<CallToolResult> => {
			try {
				await client.detachRule(relation_uid);
				return jsonResult({ relation_uid, detached: true });
			} catch (err) {
				return errorResult("detach_rule", err);
			}
		},
	);
}
