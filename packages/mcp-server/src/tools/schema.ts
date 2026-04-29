/**
 * Schema tools — manage an asset's `metadata.schema` tree.
 *
 * The Holocron API stores schema (tables, sheets, columns, fields)
 * as a nested JSON tree under `asset.metadata.schema`. The :Container
 * and :Field nodes visible in search are read-only projections of
 * that tree, regenerated on every asset write.
 *
 * The native API surface for editing schema is awkward: agents have
 * to fetch the full asset, mutate the metadata blob, and PUT the
 * whole thing back, while being careful not to drop tags / specs /
 * any other metadata key. These tools wrap that round-trip into
 * single-operation primitives so an agent can build a schema tree
 * incrementally — add a container, add fields under it, rename a
 * column, drop one — without seeing the metadata envelope.
 *
 * Paths use slash-joined names: `"orders/order_id"` resolves the
 * `order_id` field inside the `orders` container at the root. The
 * same shape that the materialised `:Container/:Field` projection
 * uses for its `path` property, so navigating from a search hit to
 * the right place in this tree is mechanical.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

interface ContainerNode {
	id?: string;
	name: string;
	description?: string | null;
	nodeType: "container";
	containerType?: string | null;
	children?: SchemaNode[];
}

interface FieldNode {
	id?: string;
	name: string;
	description?: string | null;
	nodeType: "field";
	dataType?: string | null;
	pii?: boolean;
}

type SchemaNode = ContainerNode | FieldNode;

function readSchema(asset: { metadata?: Record<string, unknown> }): SchemaNode[] {
	const raw = asset.metadata?.schema;
	if (!Array.isArray(raw)) return [];
	return raw as SchemaNode[];
}

/**
 * Patch metadata with a new schema array, preserving every other key.
 * Returns a fresh metadata object — the asset's original is left
 * untouched so the caller can pass it straight to `update_asset`.
 */
function withSchema(
	metadata: Record<string, unknown> | undefined,
	schema: SchemaNode[],
): Record<string, unknown> {
	return { ...(metadata ?? {}), schema };
}

/**
 * Walk a slash-joined path through the schema tree. Returns the
 * matching node or null if any segment doesn't resolve.
 */
function findByPath(
	tree: SchemaNode[],
	path: string,
): { node: SchemaNode; parent: SchemaNode[]; index: number } | null {
	const segments = path.split("/").filter((s) => s.length > 0);
	if (segments.length === 0) return null;
	let cursor: SchemaNode[] = tree;
	let last: { node: SchemaNode; parent: SchemaNode[]; index: number } | null = null;
	for (const seg of segments) {
		const idx = cursor.findIndex((n) => n.name === seg);
		if (idx < 0) return null;
		const node = cursor[idx];
		if (!node) return null;
		last = { node, parent: cursor, index: idx };
		if (node.nodeType === "container") {
			cursor = node.children ?? [];
		} else {
			// Reached a field — any further segments would be invalid.
			cursor = [];
		}
	}
	return last;
}

/**
 * Resolve the children array under `parentPath`, or the root tree
 * itself when parentPath is empty/undefined. Throws when the path
 * resolves to a field (fields can't have children) or doesn't exist.
 */
function resolveChildren(tree: SchemaNode[], parentPath: string | undefined): SchemaNode[] {
	if (!parentPath) return tree;
	const found = findByPath(tree, parentPath);
	if (!found) throw new Error(`parent path not found: ${parentPath}`);
	if (found.node.nodeType !== "container") {
		throw new Error(
			`parent path resolves to a ${found.node.nodeType}, only containers can have children: ${parentPath}`,
		);
	}
	if (!found.node.children) found.node.children = [];
	return found.node.children;
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerSchemaTools(server: McpServer, client: McpHolocronClient): void {
	/* ---- read ---- */
	server.registerTool(
		"get_asset_schema",
		{
			title: "Read an Asset's Schema Tree",
			description:
				"Return the schema tree (containers + fields) under an asset's `metadata.schema`. Use this when you need to inspect the structure before editing.",
			inputSchema: {
				asset_uid: z.string().min(1),
			},
		},
		async ({ asset_uid }): Promise<CallToolResult> => {
			try {
				const asset = await client.sdk.assets.get(asset_uid);
				return jsonResult({
					asset_uid,
					schema: readSchema(asset as { metadata?: Record<string, unknown> }),
				});
			} catch (err) {
				return errorResult("get_asset_schema", err);
			}
		},
	);

	/* ---- add container ---- */
	server.registerTool(
		"add_schema_container",
		{
			title: "Add a Schema Container",
			description:
				"Add a new container (table, sheet, page, section, …) to an asset's schema tree. With `parent_path`, the container is nested under that path; without it, the container is added at the root.",
			inputSchema: {
				asset_uid: z.string().min(1),
				name: z.string().min(1).describe('Display name for the container, e.g. "orders"'),
				container_type: z
					.string()
					.optional()
					.describe(
						"Sub-type the UI uses to pick an icon — e.g. table, sheet, page, section. Free-form; not validated.",
					),
				parent_path: z
					.string()
					.optional()
					.describe("Slash-joined path of the parent container. Omit to add at the schema root."),
				description: z.string().optional(),
			},
		},
		async ({
			asset_uid,
			name,
			container_type,
			parent_path,
			description,
		}): Promise<CallToolResult> => {
			try {
				const asset = await client.sdk.assets.get(asset_uid);
				const schema = readSchema(asset as { metadata?: Record<string, unknown> });
				const container: ContainerNode = {
					id: slugify(name) || undefined,
					name,
					description: description ?? null,
					nodeType: "container",
					containerType: container_type ?? null,
					children: [],
				};
				const target = resolveChildren(schema, parent_path);
				target.push(container);
				const updated = await client.sdk.assets.update(asset_uid, {
					metadata: withSchema((asset as { metadata?: Record<string, unknown> }).metadata, schema),
				});
				return jsonResult({
					asset_uid,
					added_path: parent_path ? `${parent_path}/${name}` : name,
					schema: readSchema(updated as { metadata?: Record<string, unknown> }),
				});
			} catch (err) {
				return errorResult("add_schema_container", err);
			}
		},
	);

	/* ---- add field ---- */
	server.registerTool(
		"add_schema_field",
		{
			title: "Add a Schema Field",
			description:
				"Add a field (column, measure, attribute, …) to an asset's schema tree. `parent_path` must point at an existing container.",
			inputSchema: {
				asset_uid: z.string().min(1),
				name: z.string().min(1).describe('Display name for the field, e.g. "order_id"'),
				parent_path: z
					.string()
					.min(1)
					.describe("Slash-joined path of the container this field belongs to."),
				data_type: z
					.string()
					.optional()
					.describe("Free-form type label, e.g. string / integer / uuid / timestamp."),
				pii: z.boolean().optional(),
				description: z.string().optional(),
			},
		},
		async ({
			asset_uid,
			name,
			parent_path,
			data_type,
			pii,
			description,
		}): Promise<CallToolResult> => {
			try {
				const asset = await client.sdk.assets.get(asset_uid);
				const schema = readSchema(asset as { metadata?: Record<string, unknown> });
				const field: FieldNode = {
					id: slugify(name) || undefined,
					name,
					description: description ?? null,
					nodeType: "field",
					dataType: data_type ?? null,
					pii: pii ?? false,
				};
				const target = resolveChildren(schema, parent_path);
				target.push(field);
				const updated = await client.sdk.assets.update(asset_uid, {
					metadata: withSchema((asset as { metadata?: Record<string, unknown> }).metadata, schema),
				});
				return jsonResult({
					asset_uid,
					added_path: `${parent_path}/${name}`,
					schema: readSchema(updated as { metadata?: Record<string, unknown> }),
				});
			} catch (err) {
				return errorResult("add_schema_field", err);
			}
		},
	);

	/* ---- update node ---- */
	server.registerTool(
		"update_schema_node",
		{
			title: "Update a Schema Node",
			description:
				"Update a container or field at the given path. Only the fields you pass are changed; everything else is left as-is. Renaming via `name` updates the path consumers reference, so update any callers afterwards.",
			inputSchema: {
				asset_uid: z.string().min(1),
				path: z.string().min(1).describe("Slash-joined path of the node to update."),
				name: z.string().optional(),
				description: z.string().optional(),
				container_type: z.string().optional().describe("Only meaningful on container nodes."),
				data_type: z.string().optional().describe("Only meaningful on field nodes."),
				pii: z.boolean().optional().describe("Only meaningful on field nodes."),
			},
		},
		async ({
			asset_uid,
			path,
			name,
			description,
			container_type,
			data_type,
			pii,
		}): Promise<CallToolResult> => {
			try {
				const asset = await client.sdk.assets.get(asset_uid);
				const schema = readSchema(asset as { metadata?: Record<string, unknown> });
				const found = findByPath(schema, path);
				if (!found) {
					return errorResult("update_schema_node", new Error(`path not found: ${path}`));
				}
				const node = found.node;
				if (name !== undefined) node.name = name;
				if (description !== undefined) node.description = description;
				if (container_type !== undefined && node.nodeType === "container") {
					node.containerType = container_type;
				}
				if (data_type !== undefined && node.nodeType === "field") {
					node.dataType = data_type;
				}
				if (pii !== undefined && node.nodeType === "field") {
					node.pii = pii;
				}
				const updated = await client.sdk.assets.update(asset_uid, {
					metadata: withSchema((asset as { metadata?: Record<string, unknown> }).metadata, schema),
				});
				return jsonResult({
					asset_uid,
					updated_node: node,
					schema: readSchema(updated as { metadata?: Record<string, unknown> }),
				});
			} catch (err) {
				return errorResult("update_schema_node", err);
			}
		},
	);

	/* ---- delete node ---- */
	server.registerTool(
		"delete_schema_node",
		{
			title: "Delete a Schema Node",
			description:
				"Remove a container or field at the given path. Containers are deleted *with* their descendants (no orphan check) — to keep the children, move them out via `add_*` first.",
			inputSchema: {
				asset_uid: z.string().min(1),
				path: z.string().min(1),
			},
		},
		async ({ asset_uid, path }): Promise<CallToolResult> => {
			try {
				const asset = await client.sdk.assets.get(asset_uid);
				const schema = readSchema(asset as { metadata?: Record<string, unknown> });
				const found = findByPath(schema, path);
				if (!found) {
					return errorResult("delete_schema_node", new Error(`path not found: ${path}`));
				}
				found.parent.splice(found.index, 1);
				const updated = await client.sdk.assets.update(asset_uid, {
					metadata: withSchema((asset as { metadata?: Record<string, unknown> }).metadata, schema),
				});
				return jsonResult({
					asset_uid,
					removed_path: path,
					schema: readSchema(updated as { metadata?: Record<string, unknown> }),
				});
			} catch (err) {
				return errorResult("delete_schema_node", err);
			}
		},
	);
}
