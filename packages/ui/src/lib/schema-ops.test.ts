import { describe, expect, it } from "vitest";

import {
	childPath,
	decodeSchemaPath,
	encodeSchemaPath,
	findSchemaNode,
	flattenSchema,
	insertSchemaChild,
	insertSchemaSibling,
	makeSchemaNodeId,
	type SchemaNode,
	updateSchemaNode,
} from "./schema-ops";

/**
 * Tiny tree builder so test setup reads like data, not boilerplate.
 * The real shape comes from the API; these helpers just satisfy the type.
 */
const container = (
	name: string,
	children: SchemaNode[] = [],
	extra: Partial<SchemaNode> = {},
): SchemaNode => ({
	id: `c-${name}`,
	name,
	nodeType: "container",
	children,
	...extra,
});

const field = (name: string, extra: Partial<SchemaNode> = {}): SchemaNode => ({
	id: `f-${name}`,
	name,
	nodeType: "field",
	...extra,
});

/**
 * customers
 *   └─ orders (container)
 *       ├─ id (field)
 *       └─ items (container)
 *           └─ sku (field)
 * accounts (field at root)
 */
const sampleTree = (): SchemaNode[] => [
	container("customers", [container("orders", [field("id"), container("items", [field("sku")])])]),
	field("accounts"),
];

describe("findSchemaNode", () => {
	it("returns null for empty path", () => {
		expect(findSchemaNode(sampleTree(), [])).toBeNull();
	});

	it("finds top-level node with no ancestors", () => {
		const loc = findSchemaNode(sampleTree(), ["accounts"]);
		expect(loc).not.toBeNull();
		expect(loc?.node.name).toBe("accounts");
		expect(loc?.ancestors).toEqual([]);
	});

	it("walks ancestors in order from root → parent", () => {
		const loc = findSchemaNode(sampleTree(), ["customers", "orders", "items", "sku"]);
		expect(loc?.node.name).toBe("sku");
		expect(loc?.ancestors.map((a) => a.name)).toEqual(["customers", "orders", "items"]);
	});

	it("returns null when a segment doesn't match a sibling", () => {
		expect(findSchemaNode(sampleTree(), ["customers", "ghost"])).toBeNull();
	});

	it("returns null when traversing into a leaf", () => {
		// `accounts` is a field — has no children — but the path keeps going.
		expect(findSchemaNode(sampleTree(), ["accounts", "anything"])).toBeNull();
	});

	it("first sibling with the matching name wins (documented limitation)", () => {
		const tree: SchemaNode[] = [
			field("dup", { description: "first" }),
			field("dup", { description: "second" }),
		];
		expect(findSchemaNode(tree, ["dup"])?.node.description).toBe("first");
	});
});

describe("updateSchemaNode", () => {
	it("returns the original tree for empty path", () => {
		const tree = sampleTree();
		expect(updateSchemaNode(tree, [], (n) => n)).toBe(tree);
	});

	it("applies the update to the targeted node", () => {
		const tree = sampleTree();
		const out = updateSchemaNode(tree, ["accounts"], (n) => ({
			...n,
			description: "balance sheet",
		}));
		const accounts = out.find((n) => n.name === "accounts");
		expect(accounts?.description).toBe("balance sheet");
	});

	it("removes the node when update returns null", () => {
		const out = updateSchemaNode(sampleTree(), ["customers", "orders", "id"], () => null);
		const orders = findSchemaNode(out, ["customers", "orders"]);
		expect(orders?.node.children?.map((c) => c.name)).toEqual(["items"]);
	});

	it("does not mutate the original tree", () => {
		const tree = sampleTree();
		const before = JSON.stringify(tree);
		updateSchemaNode(tree, ["accounts"], (n) => ({ ...n, pii: true }));
		expect(JSON.stringify(tree)).toBe(before);
	});

	it("leaves the tree unchanged when the path doesn't resolve", () => {
		const tree = sampleTree();
		const out = updateSchemaNode(tree, ["customers", "ghost"], () => null);
		expect(out).toEqual(tree);
	});

	it("leaves the tree unchanged when traversing into a leaf", () => {
		const tree = sampleTree();
		// `accounts` has no children — the recursive step bails out.
		const out = updateSchemaNode(tree, ["accounts", "child"], (n) => ({
			...n,
			description: "x",
		}));
		expect(out).toEqual(tree);
	});

	it("preserves siblings of touched nodes deep in the tree", () => {
		// Bumping `id`'s description must not disturb `items`.
		const out = updateSchemaNode(sampleTree(), ["customers", "orders", "id"], (n) => ({
			...n,
			description: "primary key",
		}));
		const orders = findSchemaNode(out, ["customers", "orders"]);
		expect(orders?.node.children?.map((c) => c.name)).toEqual(["id", "items"]);
	});
});

describe("insertSchemaChild", () => {
	it("appends to the root when parentPath is empty", () => {
		const out = insertSchemaChild(sampleTree(), [], field("new"));
		expect(out.map((n) => n.name)).toEqual(["customers", "accounts", "new"]);
	});

	it("prepends to the root with position='first'", () => {
		const out = insertSchemaChild(sampleTree(), [], field("new"), "first");
		expect(out.map((n) => n.name)).toEqual(["new", "customers", "accounts"]);
	});

	it("appends as a child of the targeted container", () => {
		const out = insertSchemaChild(sampleTree(), ["customers", "orders"], field("total"));
		const orders = findSchemaNode(out, ["customers", "orders"]);
		expect(orders?.node.children?.map((c) => c.name)).toEqual(["id", "items", "total"]);
	});

	it("prepends as a child with position='first'", () => {
		const out = insertSchemaChild(sampleTree(), ["customers", "orders"], field("rownum"), "first");
		const orders = findSchemaNode(out, ["customers", "orders"]);
		expect(orders?.node.children?.map((c) => c.name)).toEqual(["rownum", "id", "items"]);
	});

	it("seeds the children array when the container had none", () => {
		const tree: SchemaNode[] = [container("empty")];
		// builder gives `children: []` — strip it explicitly so we exercise the
		// `parent.children ?? []` fallback in the implementation.
		delete tree[0]?.children;
		const out = insertSchemaChild(tree, ["empty"], field("first"));
		expect(out[0]?.children?.map((c) => c.name)).toEqual(["first"]);
	});

	it("fails silently when the parent isn't a container", () => {
		const out = insertSchemaChild(sampleTree(), ["accounts"], field("nope"));
		expect(out).toEqual(sampleTree());
	});
});

describe("insertSchemaSibling", () => {
	it("appends at root when targetPath is empty", () => {
		const out = insertSchemaSibling(sampleTree(), [], field("new"));
		expect(out.map((n) => n.name)).toEqual(["customers", "accounts", "new"]);
	});

	it("inserts immediately after the target at root level", () => {
		const out = insertSchemaSibling(sampleTree(), ["customers"], field("staff"));
		expect(out.map((n) => n.name)).toEqual(["customers", "staff", "accounts"]);
	});

	it("inserts after the target inside its parent container", () => {
		const out = insertSchemaSibling(
			sampleTree(),
			["customers", "orders", "id"],
			field("created_at"),
		);
		const orders = findSchemaNode(out, ["customers", "orders"]);
		expect(orders?.node.children?.map((c) => c.name)).toEqual(["id", "created_at", "items"]);
	});

	it("falls back to appending at the parent when the target name isn't found", () => {
		const out = insertSchemaSibling(
			sampleTree(),
			["customers", "orders", "ghost"],
			field("orphan"),
		);
		const orders = findSchemaNode(out, ["customers", "orders"]);
		expect(orders?.node.children?.map((c) => c.name)).toEqual(["id", "items", "orphan"]);
	});

	it("does nothing when the parent of target isn't a container", () => {
		// `accounts` is a field, can't host children — sibling insert into
		// "accounts > X" hits the not-a-container branch.
		const out = insertSchemaSibling(sampleTree(), ["accounts", "x"], field("new"));
		expect(out).toEqual(sampleTree());
	});
});

describe("childPath", () => {
	it("appends a name without mutating the parent", () => {
		const parent = ["a", "b"] as const;
		const out = childPath(parent, "c");
		expect(out).toEqual(["a", "b", "c"]);
		expect(parent).toEqual(["a", "b"]);
	});
});

describe("encodeSchemaPath / decodeSchemaPath", () => {
	it("round-trips a plain path", () => {
		const path = ["customers", "orders", "id"];
		const encoded = encodeSchemaPath(path);
		expect(encoded).toBe("customers/orders/id");
		expect(decodeSchemaPath(encoded.split("/"))).toEqual(path);
	});

	it("escapes slashes and spaces in segment names", () => {
		const path = ["payments / refunds", "user id"];
		const encoded = encodeSchemaPath(path);
		// Slash must be percent-encoded so it can't be confused with the
		// segment separator on the way back.
		expect(encoded).toBe("payments%20%2F%20refunds/user%20id");
		expect(decodeSchemaPath(encoded.split("/"))).toEqual(path);
	});

	it("encodes empty path to empty string", () => {
		expect(encodeSchemaPath([])).toBe("");
	});

	it("decodes undefined catch-all to empty path", () => {
		expect(decodeSchemaPath(undefined)).toEqual([]);
	});

	it("decodes empty array to empty path", () => {
		expect(decodeSchemaPath([])).toEqual([]);
	});
});

describe("makeSchemaNodeId", () => {
	it("starts with the sn- prefix", () => {
		expect(makeSchemaNodeId()).toMatch(/^sn-/);
	});

	it("returns distinct ids on rapid-fire calls", () => {
		// 50 picked to dwarf the random suffix's chance of colliding while
		// still running in a single tick (where Date.now() doesn't change).
		const ids = new Set(Array.from({ length: 50 }, () => makeSchemaNodeId()));
		expect(ids.size).toBe(50);
	});
});

describe("flattenSchema", () => {
	it("yields nodes in preorder with cumulative paths", () => {
		const flat = flattenSchema(sampleTree());
		expect(flat.map((e) => e.path.join("."))).toEqual([
			"customers",
			"customers.orders",
			"customers.orders.id",
			"customers.orders.items",
			"customers.orders.items.sku",
			"accounts",
		]);
	});

	it("is empty for an empty tree", () => {
		expect(flattenSchema([])).toEqual([]);
	});

	it("respects a starting parentPath", () => {
		const flat = flattenSchema([field("x")], ["root"]);
		expect(flat[0]?.path).toEqual(["root", "x"]);
	});
});
