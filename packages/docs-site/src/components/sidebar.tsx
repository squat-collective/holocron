"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = usePathname();

	return (
		<nav className="flex flex-col gap-6 p-4 text-sm">
			{NAV.map((group) => (
				<div key={group.title} className="flex flex-col gap-1">
					<div className="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
						{group.title}
					</div>
					{group.items.map((item) => {
						const href = item.href ?? (item.slug ? `/docs/${item.slug}` : "/");
						const active = pathname === href;
						return (
							<Link
								key={`${item.title}:${href}`}
								href={href}
								onClick={onNavigate}
								className={cn(
									"rounded-md px-2 py-1.5 leading-snug transition",
									active
										? "bg-accent text-foreground font-medium"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
								)}
							>
								{item.title}
							</Link>
						);
					})}
				</div>
			))}
		</nav>
	);
}
