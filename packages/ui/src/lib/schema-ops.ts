/**
 * Pure helpers for traversing and editing the nested schema tree that lives
 * inside `asset.metadata.schema`. We identify nodes by their *name path* —
 * the sequence of names from the root down to the target — because that's
 * the only stable identifier the `/search` API currently emits and the only
 * thing we can put in a URL.
 *
 * Duplicate sibling names are not supported: the first match wins at each
 * depth. That's a known limitation we can revisit once the API returns
 * stable node ids.
 */

export interface SchemaNode {
	id: string;
	name: string;
	description?: string;
	nodeType: "container" | "field";
	containerType?: string;
	dataType?: string;
	pii?: boolean;
	children?: SchemaNode[];
}

export interface SchemaLocation {
	node: SchemaNode;
	/** Ancestors from root → direct parent (empty when the target is top-level). */
	ancestors: SchemaNode[];
}

/** Find a node by its name-path. `null` when any segment doesn't match. */
export function findSchemaNode(tree: SchemaNode[], path: readonly string[]): SchemaLocation | null {
	if (path.length === 0) return null;
	let siblings = tree;
	const ancestors: SchemaNode[] = [];
	for (let i = 0; i < path.length; i++) {
		const segment = path[i];
		const node = siblings.find((n) => n.name === segment);
		if (!node) return null;
		if (i === path.length - 1) {
			return { node, ancestors };
		}
		if (!node.children) return null;
		ancestors.push(node);
		siblings = node.children;
	}
	return null;
}

/**
 * Apply `update` to the node at `path`. Returning `null` from `update`
 * removes the node from its parent's children. Returns a new tree (pure).
 * If the path doesn't resolve, the tree is returned unchanged.
 */
export function updateSchemaNode(
	tree: SchemaNode[],
	path: readonly string[],
	update: (node: SchemaNode) => SchemaNode | null,
): SchemaNode[] {
	if (path.length === 0) return tree;
	const [head, ...rest] = path;
	return tree
		.map((node) => {
			if (node.name !== head) return node;
			if (rest.length === 0) {
				return update(node);
			}
			if (!node.children) return node;
			return {
				...node,
				children: updateSchemaNode(node.children, rest, update),
			};
		})
		.filter((n): n is SchemaNode => n !== null);
}

/**
 * Insert `child` as a new child of the node at `parentPath`. If `parentPath`
 * is empty, adds to the root. By default the child is appended; pass
 * `position: "first"` to prepend instead. Returns a new tree. Fails silently
 * when the parent isn't a container.
 */
export function insertSchemaChild(
	tree: SchemaNode[],
	parentPath: readonly string[],
	child: SchemaNode,
	position: "first" | "last" = "last",
): SchemaNode[] {
	if (parentPath.length === 0) {
		return position === "first" ? [child, ...tree] : [...tree, child];
	}
	return updateSchemaNode(tree, parentPath, (parent) => {
		if (parent.nodeType !== "container") return parent;
		const existing = parent.children ?? [];
		return {
			...parent,
			children: position === "first" ? [child, ...existing] : [...existing, child],
		};
	});
}

/**
 * Insert `sibling` immediately after the node at `targetPath`. Falls back to
 * appending at the parent if the target isn't found.
 */
export function insertSchemaSibling(
	tree: SchemaNode[],
	targetPath: readonly string[],
	sibling: SchemaNode,
): SchemaNode[] {
	if (targetPath.length === 0) return [...tree, sibling];
	const parentPath = targetPath.slice(0, -1);
	const targetName = targetPath[targetPath.length - 1];

	const inject = (siblings: SchemaNode[]) => {
		const idx = siblings.findIndex((n) => n.name === targetName);
		if (idx < 0) return [...siblings, sibling];
		return [...siblings.slice(0, idx + 1), sibling, ...siblings.slice(idx + 1)];
	};

	if (parentPath.length === 0) return inject(tree);
	return updateSchemaNode(tree, parentPath, (parent) => {
		if (parent.nodeType !== "container") return parent;
		return { ...parent, children: inject(parent.children ?? []) };
	});
}

/**
 * Build a child path — just append `name`. Sugar for readability at call sites.
 */
export function childPath(parent: readonly string[], name: string): string[] {
	return [...parent, name];
}

/**
 * Encode a schema name-path into URL segments. Empty-segment paths map to
 * the asset root.
 */
export function encodeSchemaPath(path: readonly string[]): string {
	return path.map(encodeURIComponent).join("/");
}

/**
 * Decode URL segments (already split) back into a name-path. Handles
 * Next.js catch-all params (`string[] | undefined`).
 */
export function decodeSchemaPath(segments: string[] | undefined): string[] {
	if (!segments || segments.length === 0) return [];
	return segments.map((s) => decodeURIComponent(s));
}

/**
 * Generate a reasonably-unique schema node id. Not cryptographically strong
 * — the backend may replace it. We just need local uniqueness for React keys
 * and to disambiguate new nodes before the server round-trip completes.
 */
export function makeSchemaNodeId(): string {
	return `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Suggested container kinds. Paired with the icon lookup in `icons.tsx` —
 * keep these in sync when adding new ones.
 */
export const CONTAINER_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
	{ value: "sheet", label: "Sheet" },
	{ value: "table", label: "Table" },
	{ value: "page", label: "Page" },
	{ value: "section", label: "Section" },
	{ value: "view", label: "View" },
	{ value: "dashboard", label: "Dashboard" },
	{ value: "model", label: "Model" },
	{ value: "endpoint", label: "Endpoint" },
];

/** Suggested field data types — suggestions only, custom values are allowed. */
export const DATA_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
	{ value: "string", label: "string" },
	{ value: "int", label: "int" },
	{ value: "float", label: "float" },
	{ value: "bool", label: "bool" },
	{ value: "date", label: "date" },
	{ value: "timestamp", label: "timestamp" },
	{ value: "json", label: "json" },
	{ value: "uuid", label: "uuid" },
	{ value: "email", label: "email" },
];

/**
 * Pre-order walk yielding each node with its full name-path from the tree
 * root. Used to project the nested schema into a flat list — palette
 * commands, pickers, and breadcrumbs all prefer the flattened view.
 */
export function flattenSchema(
	tree: readonly SchemaNode[],
	parentPath: readonly string[] = [],
): { node: SchemaNode; path: string[] }[] {
	const out: { node: SchemaNode; path: string[] }[] = [];
	for (const node of tree) {
		const path = [...parentPath, node.name];
		out.push({ node, path });
		if (node.children && node.children.length > 0) {
			out.push(...flattenSchema(node.children, path));
		}
	}
	return out;
}
