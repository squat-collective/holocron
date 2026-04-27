import Link from "next/link";
import {
	ArrowRight,
	Clipboard,
	Database,
	FileSpreadsheet,
	FileText,
	Files,
	LayoutGrid,
	ScanSearch,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
	Table,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Capability = "IMPORT" | "EXPORT";
type Family = "Connector" | "Exporter" | "Audit" | "SDK" | "MCP";

interface Plugin {
	slug: string;
	title: string;
	icon: string;
	family: Family;
	capability?: Capability;
	tagline: string;
	body: string;
	repoLink: string;
	IconComp: ComponentType<SVGProps<SVGSVGElement>>;
}

const PLUGINS: Plugin[] = [
	{
		slug: "csv-connector",
		title: "CSV connector",
		icon: "📄",
		family: "Connector",
		capability: "IMPORT",
		tagline: "CSV/TSV files in",
		body: "Sniffs encoding, delimiter, and column types. Parses # Owner: comment headers as Person actors. One Dataset per file with schema projected as Container/Field nodes.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/connector-csv",
		IconComp: FileText,
	},
	{
		slug: "excel-connector",
		title: "Excel connector",
		icon: "📊",
		family: "Connector",
		capability: "IMPORT",
		tagline: ".xlsx files in",
		body: "System / Sheet / Table hierarchy. Detects formal ListObjects + heuristic tables. Captures formula lineage (VLOOKUP / XLOOKUP / INDEX-MATCH), cross-file refs, and owners from custom properties.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/connector-excel",
		IconComp: FileSpreadsheet,
	},
	{
		slug: "postgres-connector",
		title: "Postgres connector",
		icon: "🐘",
		family: "Connector",
		capability: "IMPORT",
		tagline: "PostgreSQL schemas in",
		body: "One dataset per table or view, with column-level schema. Idempotent UIDs (host + db + schema + table) so re-runs upsert. Passwords scrubbed from any returned errors.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/connector-postgres",
		IconComp: Database,
	},
	{
		slug: "powerbi-connector",
		title: "Power BI connector",
		icon: "📈",
		family: "Connector",
		capability: "IMPORT",
		tagline: ".pbix files in",
		body: "Walks the Layout JSON and DAX query structure to extract referenced tables and columns. Emits report → table USES edges per visual.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/connector-powerbi",
		IconComp: Table,
	},
	{
		slug: "excel-exporter",
		title: "Excel exporter",
		icon: "📤",
		family: "Exporter",
		capability: "EXPORT",
		tagline: "Catalog → multi-tab .xlsx",
		body: "One workbook with Overview, Assets, Actors, Relations, Schemas, Lineage tabs. Round-trips back through the Excel connector for offline review workflows.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/exporter-excel",
		IconComp: Files,
	},
	{
		slug: "data-dictionary-markdown",
		title: "Markdown data dictionary",
		icon: "📚",
		family: "Exporter",
		capability: "EXPORT",
		tagline: "Catalog → zip of Markdown",
		body: "One README.md plus per-asset and per-actor pages. Browses cleanly on GitHub, drops into a docs site, feeds LLMs as context.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/exporter-markdown",
		IconComp: Clipboard,
	},
	{
		slug: "lineage-gap-audit",
		title: "Lineage gap audit",
		icon: "🔍",
		family: "Audit",
		capability: "EXPORT",
		tagline: "Hygiene report",
		body: "Excel workbook flagging orphan assets, lineage dead-ends, undocumented entities, dangling rules, unverified items. Use it as a worklist for catalog hygiene.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/audit-lineage-gaps",
		IconComp: ShieldAlert,
	},
	{
		slug: "compliance-report",
		title: "Compliance report",
		icon: "🛡️",
		family: "Audit",
		capability: "EXPORT",
		tagline: "Governance snapshot",
		body: "Excel workbook with rules in force, PII inventory, ownership matrix, recent verifications, coverage stats. The 'prove what's true' artefact for audit + security review.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/compliance-report",
		IconComp: ShieldCheck,
	},
	{
		slug: "pii-detector",
		title: "PII detector",
		icon: "🪪",
		family: "Audit",
		capability: "IMPORT",
		tagline: "PII candidates in fields",
		body: "Field-name pattern classifier: high-confidence (email, ssn, dob, …) vs medium-confidence (name, country, customer_id). Read-only — reviewers apply flags via Edit field → toggle PII.",
		repoLink:
			"https://github.com/squat-collective/holocron/tree/main/packages/pii-detector",
		IconComp: ScanSearch,
	},
];

const FAMILY_COLORS: Record<Family, string> = {
	Connector: "border-emerald-500/40 text-emerald-300",
	Exporter: "border-sky-500/40 text-sky-300",
	Audit: "border-amber-500/40 text-amber-300",
	SDK: "border-violet-500/40 text-violet-300",
	MCP: "border-fuchsia-500/40 text-fuchsia-300",
};

export const metadata = {
	title: "Plugins",
	description:
		"Catalog of built-in Holocron plugins — connectors, exporters, audits.",
};

export default function PluginsPage() {
	return (
		<div className="flex flex-col gap-10 pb-12">
			<header className="flex flex-col gap-3 pt-2">
				<div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
					<LayoutGrid className="h-3.5 w-3.5 text-primary" />
					Plugin catalog
				</div>
				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
					9 plugins, one contract
				</h1>
				<p className="max-w-2xl text-muted-foreground">
					Connectors push, exporters pull, audits report. All discovered at API
					startup via the <code className="rounded bg-accent/60 px-1 py-0.5 text-xs">holocron.plugins</code> entry-point group, all driven by the same
					manifest + async <code className="rounded bg-accent/60 px-1 py-0.5 text-xs">run()</code> contract from the SDK.
				</p>
				<div className="flex flex-wrap gap-3">
					<Link
						href="/docs/plugins"
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
					>
						How plugins work
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
					<Link
						href="/docs/plugins#writing-a-plugin"
						className="inline-flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-accent"
					>
						Write your own
					</Link>
				</div>
			</header>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{PLUGINS.map((p) => (
					<a
						key={p.slug}
						href={p.repoLink}
						target="_blank"
						rel="noreferrer"
						className="group flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-5 backdrop-blur transition hover:border-primary/40 hover:bg-card/60"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-center gap-3">
								<div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background/50 text-xl">
									<span aria-hidden>{p.icon}</span>
								</div>
								<div>
									<h3 className="text-base font-semibold leading-tight">
										{p.title}
									</h3>
									<div className="text-xs text-muted-foreground">
										{p.tagline}
									</div>
								</div>
							</div>
							<p.IconComp className="h-5 w-5 shrink-0 text-muted-foreground/70" />
						</div>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{p.body}
						</p>
						<div className="mt-auto flex items-center gap-2 pt-2">
							<span
								className={`rounded-full border px-2 py-0.5 text-[0.65rem] uppercase tracking-wider ${FAMILY_COLORS[p.family]}`}
							>
								{p.family}
							</span>
							{p.capability && (
								<span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
									{p.capability}
								</span>
							)}
							<code className="ml-auto text-[0.7rem] text-muted-foreground/80">
								{p.slug}
							</code>
						</div>
					</a>
				))}
			</section>

			<section className="rounded-xl border border-border bg-card/30 p-6 backdrop-blur">
				<div className="flex items-start gap-3">
					<Sparkles className="h-5 w-5 shrink-0 text-primary" />
					<div>
						<h2 className="text-lg font-semibold">
							Drive plugins from the terminal
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							The SDK ships <code className="rounded bg-accent/60 px-1 py-0.5 text-xs">holocron-plugin</code> — list, inspect, and invoke any plugin against a running API.
						</p>
						<pre className="mt-4 overflow-x-auto rounded-md border border-border/60 bg-background/50 p-4 text-sm">
							<code>{`holocron-plugin list --api http://localhost:8100
holocron-plugin show data-dictionary-markdown
holocron-plugin run csv-connector --input file=@orders.csv -o scan.json`}</code>
						</pre>
					</div>
				</div>
			</section>
		</div>
	);
}
