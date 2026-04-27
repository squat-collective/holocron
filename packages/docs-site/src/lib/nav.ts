/**
 * Sidebar manifest. Order = display order. Each entry's `slug` is the
 * /[...slug] path AND the markdown filename under repo-root `docs/`
 * (or under `docs/architecture/...` for the nested ones).
 */

export interface NavLink {
	title: string;
	/** Markdown slug under repo `docs/` — used to load and search the page. */
	slug: string;
	/** Override the rendered href if the page lives outside /docs/[...slug]. */
	href?: string;
	description?: string;
}

export interface NavGroup {
	title: string;
	items: NavLink[];
}

export const NAV: NavGroup[] = [
	{
		title: "Start here",
		items: [
			{ title: "Introduction", slug: "" /* renders the landing page */ },
			{ title: "Getting started", slug: "getting-started" },
			{ title: "Concepts", slug: "concepts" },
			{ title: "Glossary", slug: "glossary" },
		],
	},
	{
		title: "Use it",
		items: [
			{ title: "Search", slug: "search" },
			{ title: "3D galaxy map", slug: "map" },
			{ title: "Webhooks", slug: "webhooks" },
			{ title: "UI extensions", slug: "extensions" },
		],
	},
	{
		title: "Extend it",
		items: [
			{ title: "Plugin catalog", slug: "plugins", href: "/plugins" },
			{ title: "Writing a plugin", slug: "plugins" },
		],
	},
	{
		title: "Operate it",
		items: [
			{ title: "Deployment", slug: "deployment" },
			{ title: "Development", slug: "development" },
		],
	},
	{
		title: "Architecture",
		items: [
			{ title: "Current architecture", slug: "architecture/specs/current-architecture" },
			{ title: "ADR-001 · Neo4j as primary storage", slug: "architecture/adr/001-neo4j-as-primary-storage" },
			{ title: "ADR-002 · FastAPI as web framework", slug: "architecture/adr/002-fastapi-as-framework" },
			{ title: "ADR-003 · Reader plugin architecture", slug: "architecture/adr/003-reader-plugin-architecture" },
			{ title: "ADR-004 · Multi-label node model", slug: "architecture/adr/004-multi-label-node-model" },
			{ title: "ADR-005 · Hybrid search", slug: "architecture/adr/005-hybrid-search" },
			{ title: "ADR-006 · Plugin SDK + entry points", slug: "architecture/adr/006-plugin-sdk-entry-points" },
			{ title: "ADR-007 · Outbound webhooks", slug: "architecture/adr/007-outbound-webhooks" },
			{ title: "ADR-008 · Schema projection", slug: "architecture/adr/008-schema-projection" },
		],
	},
];

/** Flatten to a list of valid slugs for build-time validation + search. */
export function allSlugs(): string[] {
	return NAV.flatMap((g) => g.items.map((i) => i.slug)).filter((s) => s.length > 0);
}

export function findNavItem(slug: string): NavLink | undefined {
	for (const g of NAV) {
		const found = g.items.find((i) => i.slug === slug);
		if (found) return found;
	}
	return undefined;
}
