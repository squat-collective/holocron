/**
 * Read and render Holocron's repo-root /docs/*.md at build time.
 *
 * The site lives at packages/docs-site/, so the docs root is two levels up.
 * Resolved through process.cwd() to keep this portable across `next dev`,
 * `next build`, and the container's /app/packages/docs-site/ working dir.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";

const DOCS_ROOT = path.resolve(process.cwd(), "..", "..", "docs");

export interface RenderedDoc {
	slug: string;
	title: string;
	html: string;
	headings: Array<{ depth: number; text: string; id: string }>;
	frontmatter: Record<string, unknown>;
	plainText: string;
}

/**
 * Render a slug like "getting-started" or "architecture/adr/005-hybrid-search"
 * by reading docs/<slug>.md (or docs/README.md when slug is empty).
 */
export async function renderDoc(slug: string): Promise<RenderedDoc | null> {
	const relPath = slug === "" ? "README.md" : `${slug}.md`;
	const fullPath = path.join(DOCS_ROOT, relPath);

	let raw: string;
	try {
		raw = await readFile(fullPath, "utf8");
	} catch {
		return null;
	}

	const parsed = matter(raw);
	const file = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: false })
		.use(rehypeSlug)
		.use(rehypeAutolinkHeadings, {
			behavior: "append",
			properties: { className: ["anchor"], "aria-label": "Link to section" },
			content: { type: "text", value: "#" },
		})
		.use(rehypePrettyCode, {
			theme: { dark: "github-dark-dimmed", light: "github-light" },
			defaultLang: "plaintext",
			keepBackground: false,
		})
		.use(rehypeStringify)
		.process(parsed.content);

	const html = String(file)
		// Rewrite intra-doc links: ./other.md → /docs/other, ../adr/x.md → /docs/architecture/adr/x.
		// Anything outside our docs tree is left untouched (e.g. links into packages/).
		.replaceAll(/href="([^"]+)"/g, (match, href: string) => {
			const rewritten = rewriteHref(slug, href);
			return `href="${rewritten}"`;
		});

	const headings = extractHeadings(parsed.content);
	const title =
		(parsed.data.title as string | undefined) ??
		headings.find((h) => h.depth === 1)?.text ??
		(slug || "Holocron Docs");
	const plainText = parsed.content
		.replaceAll(/```[\s\S]*?```/g, " ")
		.replaceAll(/`[^`]*`/g, " ")
		.replaceAll(/[#>*_\-`]/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();

	return {
		slug,
		title,
		html,
		headings,
		frontmatter: parsed.data,
		plainText,
	};
}

function extractHeadings(md: string): Array<{ depth: number; text: string; id: string }> {
	const out: Array<{ depth: number; text: string; id: string }> = [];
	const re = /^(#{1,4})\s+(.+?)\s*$/gm;
	let m: RegExpExecArray | null;
	while ((m = re.exec(md)) !== null) {
		const depth = m[1]?.length ?? 1;
		const text = (m[2] ?? "").replace(/`/g, "");
		out.push({ depth, text, id: slugify(text) });
	}
	return out;
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-");
}

/**
 * Rewrite a markdown link href so it points to a doc-site route when
 * possible, leaving in-page anchors and external links alone.
 *
 * The source markdown lives under repo /docs and uses relative paths to
 * other markdown files. The site renders them under /docs/<slug>.
 */
function rewriteHref(currentSlug: string, href: string): string {
	if (!href) return href;
	if (href.startsWith("#")) return href; // in-page anchor
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href; // absolute URL or mailto:
	if (href.startsWith("/")) return href; // absolute path

	// Strip query/hash for resolution, re-attach later
	const [pathPart, ...rest] = href.split(/(?=[?#])/);
	const tail = rest.join("");
	if (!pathPart) return href;

	// Resolve relative to current slug's *directory* in the docs tree
	const currentDir = currentSlug.includes("/")
		? currentSlug.slice(0, currentSlug.lastIndexOf("/"))
		: "";
	const joined = path.posix.join(currentDir, pathPart);
	const normalised = path.posix.normalize(joined);

	// Only rewrite .md links that resolve inside the docs tree
	if (normalised.startsWith("..")) return href;
	if (!normalised.endsWith(".md") && !normalised.endsWith("/")) return href;
	if (normalised.endsWith("/")) return href;

	const slugged = normalised.replace(/\.md$/, "").replace(/^README$/, "");
	return slugged ? `/docs/${slugged}${tail}` : `/${tail}`;
}
