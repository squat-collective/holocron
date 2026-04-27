"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export function ThemeToggle({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	const isDark = mounted ? resolvedTheme === "dark" : true;

	return (
		<button
			type="button"
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/40 text-foreground/70 backdrop-blur transition hover:bg-accent hover:text-foreground",
				className,
			)}
		>
			{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
		</button>
	);
}
