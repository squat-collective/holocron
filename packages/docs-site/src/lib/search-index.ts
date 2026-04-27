/**
 * Build the client-side search payload at build time. Consumed as a JSON
 * import by the command palette so there's no extra fetch on first open.
 */

import { allSlugs, findNavItem } from "./nav";
import { renderDoc } from "./markdown";

export interface SearchEntry {
	slug: string; // empty for landing
	title: string;
	href: string;
	excerpt: string;
	body: string;
}

export async function buildSearchIndex(): Promise<SearchEntry[]> {
	const slugs = ["", ...allSlugs()];
	const seen = new Set<string>();
	const entries: SearchEntry[] = [];

	for (const slug of slugs) {
		if (seen.has(slug)) continue;
		seen.add(slug);
		const doc = await renderDoc(slug);
		if (!doc) continue;
		const navItem = findNavItem(slug);
		entries.push({
			slug,
			title: navItem?.title ?? doc.title,
			href: slug ? `/docs/${slug}` : "/",
			excerpt: doc.plainText.slice(0, 220),
			body: doc.plainText.slice(0, 4000),
		});
	}

	// Add a synthetic entry for the rich plugin catalog
	entries.push({
		slug: "__catalog__",
		title: "Plugin catalog",
		href: "/plugins",
		excerpt:
			"Browse the 9 built-in plugins (CSV, Excel, Postgres, Power BI, Excel exporter, Markdown exporter, lineage gap audit, compliance report, PII detector).",
		body: "plugins catalog connectors exporters audit pii postgres powerbi excel csv markdown compliance lineage",
	});

	return entries;
}
