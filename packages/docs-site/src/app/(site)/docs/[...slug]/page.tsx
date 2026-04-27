import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { renderDoc } from "@/lib/markdown";
import { allSlugs, findNavItem } from "@/lib/nav";

interface Props {
	params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
	return allSlugs().map((s) => ({ slug: s.split("/") }));
}

export async function generateMetadata({ params }: Props) {
	const { slug } = await params;
	const slugStr = slug.join("/");
	const navItem = findNavItem(slugStr);
	const doc = await renderDoc(slugStr);
	if (!doc) return { title: "Not found" };
	return { title: navItem?.title ?? doc.title };
}

export default async function DocPage({ params }: Props) {
	const { slug } = await params;
	const slugStr = slug.join("/");
	const doc = await renderDoc(slugStr);
	if (!doc) notFound();

	return (
		<article className="flex w-full min-w-0 flex-col gap-6">
			<Breadcrumbs slug={slugStr} title={doc.title} />
			<div
				className="prose-holo w-full"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted in-repo markdown
				dangerouslySetInnerHTML={{ __html: doc.html }}
			/>
			<TableOfContents headings={doc.headings} />
		</article>
	);
}

function Breadcrumbs({ slug, title }: { slug: string; title: string }) {
	const parts = slug.split("/");
	const trail = parts.map((part, i) => {
		const href = `/docs/${parts.slice(0, i + 1).join("/")}`;
		const isLast = i === parts.length - 1;
		return { href, label: isLast ? title : prettify(part), isLast };
	});

	return (
		<nav
			aria-label="Breadcrumb"
			className="flex items-center gap-1 text-xs text-muted-foreground"
		>
			<Link href="/" className="hover:text-foreground">
				Docs
			</Link>
			{trail.map((t) => (
				<span key={t.href} className="flex items-center gap-1">
					<ChevronRight className="h-3 w-3" />
					{t.isLast ? (
						<span className="text-foreground">{t.label}</span>
					) : (
						<Link href={t.href} className="hover:text-foreground">
							{t.label}
						</Link>
					)}
				</span>
			))}
		</nav>
	);
}

function prettify(s: string): string {
	return s
		.replaceAll(/^[0-9]+-/g, "")
		.replaceAll("-", " ")
		.replace(/^./, (c) => c.toUpperCase());
}

function TableOfContents({
	headings,
}: {
	headings: Array<{ depth: number; text: string; id: string }>;
}) {
	const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
	if (items.length < 3) return null;

	return (
		<aside className="mt-8 rounded-lg border border-border/60 bg-card/30 p-4 backdrop-blur xl:hidden">
			<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				On this page
			</div>
			<ul className="mt-2 flex flex-col gap-1 text-sm">
				{items.map((h) => (
					<li
						key={h.id}
						className={h.depth === 3 ? "pl-3 text-muted-foreground" : "text-foreground"}
					>
						<a
							href={`#${h.id}`}
							className="hover:text-primary"
						>
							{h.text}
						</a>
					</li>
				))}
			</ul>
		</aside>
	);
}
