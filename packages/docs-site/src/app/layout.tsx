import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GalaxyBackground } from "@/components/galaxy-background";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: { default: "Holocron Docs", template: "%s · Holocron Docs" },
	description:
		"Declarative data governance — assets, lineage, hybrid search, a 3D map, and a plugin ecosystem.",
};

const noFlash = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var resolved = stored === 'light' || stored === 'dark' ? stored : 'dark';
    if (resolved === 'dark') document.documentElement.classList.add('dark');
  } catch (_) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: noFlash }} />
			</head>
			<body className="min-h-screen text-foreground antialiased">
				<ThemeProvider>
					<GalaxyBackground />
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
