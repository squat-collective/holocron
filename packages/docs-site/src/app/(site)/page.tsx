import Link from "next/link";
import {
	ArrowRight,
	BookOpen,
	Boxes,
	Cable,
	Compass,
	Globe2,
	Plug,
	Radar,
	Rocket,
	Sparkles,
	Webhook,
} from "lucide-react";

const FEATURES = [
	{
		icon: Boxes,
		title: "One graph for everything",
		body: "Datasets, reports, processes, systems, people, teams, rules — all in one Neo4j graph with multi-label nodes and clear relationship types.",
	},
	{
		icon: Sparkles,
		title: "Hybrid search",
		body: "Vector + fulltext fused per kind, with a small DSL (ds:, owner:, feeds:, \"phrase\", -exclude) for power users.",
	},
	{
		icon: Globe2,
		title: "3D galaxy map",
		body: "Every asset is a star, every relation an edge. Animated lineage particles, multi-lock focus, keyboard nav.",
	},
	{
		icon: Plug,
		title: "Plugin ecosystem",
		body: "Connectors for CSV, Excel, Postgres, Power BI. Exporters for Excel and Markdown. Audit, compliance, and PII detection. All discovered via entry points.",
	},
	{
		icon: Webhook,
		title: "Outbound webhooks",
		body: "Subscribe to event topics. HMAC-SHA256 signed deliveries, fire-and-forget, auto-disable on failures.",
	},
	{
		icon: Cable,
		title: "MCP-ready",
		body: "An MCP server exposes the catalog to Claude Desktop, Claude Code, and any MCP client. Browse, edit, run plugins by chat.",
	},
];

const QUICK_LINKS = [
	{
		href: "/docs/getting-started",
		title: "Getting started",
		body: "Bring up the stack and create your first asset.",
		icon: Rocket,
	},
	{
		href: "/docs/concepts",
		title: "Concepts",
		body: "Entities, relations, multi-label nodes, schema projection.",
		icon: Compass,
	},
	{
		href: "/docs/plugins",
		title: "Plugins",
		body: "Catalog of built-ins + how to write your own.",
		icon: Plug,
	},
	{
		href: "/docs/architecture/specs/current-architecture",
		title: "Architecture",
		body: "The system as it stands.",
		icon: Radar,
	},
];

export default function LandingPage() {
	return (
		<div className="flex flex-col gap-16 pb-12">
			<section className="flex flex-col gap-6 pt-4 sm:pt-8">
				<div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
					<Sparkles className="h-3.5 w-3.5 text-star-gold" />
					Documentation · v0.1
				</div>
				<h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
					A graph of every dataset, owner, and rule
					<br />
					<span className="bg-gradient-to-r from-primary via-fuchsia-400 to-star-gold bg-clip-text text-transparent">
						in your organisation.
					</span>
				</h1>
				<p className="max-w-2xl text-lg text-muted-foreground">
					Holocron is a declarative data governance platform — REST API on
					Neo4j, a TypeScript SDK, a Next.js portal with a 3D galaxy map, an
					MCP server for AI assistants, and a plugin ecosystem to keep the
					catalog in sync with reality.
				</p>
				<div className="flex flex-wrap gap-3 pt-2">
					<Link
						href="/docs/getting-started"
						className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
					>
						Get started
						<ArrowRight className="h-4 w-4" />
					</Link>
					<Link
						href="/docs/concepts"
						className="inline-flex items-center gap-2 rounded-md border border-border bg-card/40 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-accent"
					>
						<BookOpen className="h-4 w-4" />
						Read the concepts
					</Link>
					<a
						href="https://github.com/squat-collective/holocron"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-2 rounded-md border border-border bg-card/40 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-accent"
					>
						View on GitHub
					</a>
				</div>
			</section>

			<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{FEATURES.map((f) => (
					<div
						key={f.title}
						className="rounded-xl border border-border bg-card/40 p-5 backdrop-blur transition hover:border-primary/40 hover:bg-card/60"
					>
						<f.icon className="h-5 w-5 text-primary" />
						<h3 className="mt-3 text-base font-semibold">{f.title}</h3>
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							{f.body}
						</p>
					</div>
				))}
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-xl font-semibold tracking-tight">Jump in</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					{QUICK_LINKS.map((q) => (
						<Link
							key={q.href}
							href={q.href}
							className="group flex items-start gap-3 rounded-lg border border-border bg-card/40 p-4 backdrop-blur transition hover:border-primary/40 hover:bg-card/60"
						>
							<q.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1 text-sm font-semibold">
									{q.title}
									<ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
								</div>
								<div className="text-sm text-muted-foreground">{q.body}</div>
							</div>
						</Link>
					))}
				</div>
			</section>

			<section className="rounded-xl border border-border bg-card/30 p-6 backdrop-blur">
				<h2 className="text-lg font-semibold">Run it locally</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Three services, one command. Podman or Docker — no host installs.
				</p>
				<pre className="mt-4 overflow-x-auto rounded-md border border-border/60 bg-background/50 p-4 text-sm">
					<code>{`make up        # neo4j + api + ui
make health    # smoke check
# API  → http://localhost:8100
# UI   → http://localhost:3333
# Neo4j → http://localhost:7474`}</code>
				</pre>
			</section>
		</div>
	);
}
