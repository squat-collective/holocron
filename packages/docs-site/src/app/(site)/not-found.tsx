import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex flex-col items-start gap-4 py-16">
			<h1 className="text-3xl font-semibold tracking-tight">Lost in space</h1>
			<p className="max-w-md text-muted-foreground">
				That page isn't on our charts. Try the navigation, or jump back to the
				home shell.
			</p>
			<Link
				href="/"
				className="inline-flex items-center gap-2 rounded-md border border-border bg-card/40 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-accent"
			>
				Back to docs
			</Link>
		</div>
	);
}
