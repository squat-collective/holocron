import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopNav } from "@/components/top-nav";

// Layout for the actual docs surface — top nav + sidebar wrapped around
// the markdown / landing / plugins pages. Sibling routes outside this
// group (e.g. /linkedin/* for carousel slides) render without chrome.
export default function SiteLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<TopNav />
			<div className="mx-auto flex w-full max-w-7xl gap-8 px-4 lg:px-6">
				<aside className="hidden w-60 shrink-0 lg:block">
					<div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-6">
						<Sidebar />
					</div>
				</aside>
				<main className="min-w-0 flex-1 py-8 lg:py-10">{children}</main>
			</div>
		</>
	);
}
