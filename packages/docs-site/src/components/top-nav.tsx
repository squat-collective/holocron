"use client";

import Link from "next/link";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Github, Menu, Search, X } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/cn";

export function TopNav() {
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);

	return (
		<>
			<header
				className={cn(
					"sticky top-0 z-40 border-b border-border/60 backdrop-blur",
					"bg-background/55 supports-[backdrop-filter]:bg-background/40",
				)}
			>
				<div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
					<Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
						<Dialog.Trigger asChild>
							<button
								type="button"
								aria-label="Open navigation"
								className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/40 text-foreground/70 backdrop-blur transition hover:bg-accent hover:text-foreground lg:hidden"
							>
								<Menu className="h-4 w-4" />
							</button>
						</Dialog.Trigger>
						<Dialog.Portal>
							<Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
							<Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-background/95 shadow-xl backdrop-blur focus:outline-none">
								<div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
									<Dialog.Title className="text-sm font-semibold tracking-wide">
										Holocron Docs
									</Dialog.Title>
									<Dialog.Close asChild>
										<button
											type="button"
											aria-label="Close navigation"
											className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
										>
											<X className="h-4 w-4" />
										</button>
									</Dialog.Close>
								</div>
								<div className="h-[calc(100vh-3.25rem)] overflow-y-auto">
									<Sidebar onNavigate={() => setDrawerOpen(false)} />
								</div>
							</Dialog.Content>
						</Dialog.Portal>
					</Dialog.Root>

					<Link href="/" className="flex items-center gap-2 text-sm font-semibold">
						<HolocronMark />
						<span className="hidden sm:inline">Holocron Docs</span>
					</Link>

					<div className="ml-auto flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPaletteOpen(true)}
							className="hidden h-9 items-center gap-2 rounded-md border border-border bg-card/40 px-3 text-xs text-muted-foreground backdrop-blur transition hover:bg-accent hover:text-foreground sm:inline-flex"
						>
							<Search className="h-3.5 w-3.5" />
							<span>Search docs</span>
							<kbd className="ml-2 rounded border border-border bg-background/60 px-1.5 py-0.5 text-[0.65rem] font-mono">
								⌘K
							</kbd>
						</button>
						<button
							type="button"
							aria-label="Search"
							onClick={() => setPaletteOpen(true)}
							className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/40 text-foreground/70 backdrop-blur transition hover:bg-accent hover:text-foreground sm:hidden"
						>
							<Search className="h-4 w-4" />
						</button>
						<a
							href="https://github.com/squat-collective/holocron"
							target="_blank"
							rel="noreferrer"
							aria-label="GitHub"
							className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/40 text-foreground/70 backdrop-blur transition hover:bg-accent hover:text-foreground"
						>
							<Github className="h-4 w-4" />
						</a>
						<ThemeToggle />
					</div>
				</div>
			</header>
			<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
		</>
	);
}

function HolocronMark() {
	return (
		<svg
			viewBox="0 0 32 32"
			width="22"
			height="22"
			aria-hidden="true"
			className="text-primary"
		>
			<defs>
				<radialGradient id="holo-core" cx="50%" cy="50%" r="50%">
					<stop offset="0%" stopColor="currentColor" stopOpacity="1" />
					<stop offset="100%" stopColor="currentColor" stopOpacity="0" />
				</radialGradient>
			</defs>
			<circle cx="16" cy="16" r="14" fill="url(#holo-core)" opacity="0.35" />
			<circle cx="16" cy="16" r="3.2" fill="currentColor" />
			<g stroke="currentColor" strokeWidth="1.1" fill="none" opacity="0.85">
				<ellipse cx="16" cy="16" rx="11" ry="4" transform="rotate(-20 16 16)" />
				<ellipse cx="16" cy="16" rx="11" ry="4" transform="rotate(40 16 16)" />
			</g>
		</svg>
	);
}
