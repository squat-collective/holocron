import type { Metadata } from "next";
import { CommandPalette } from "@/components/layout/command-palette";
import { KeyboardHelp } from "@/components/layout/keyboard-help";
import { GalaxyBackground } from "@/components/layout/galaxy-background";
import { Header } from "@/components/layout/header";
import { WizardHost } from "@/components/layout/wizard-host";
import { Toaster } from "@/components/ui/sonner";
import { ExtensionHost, PluginsExtensionAdapter } from "@/extensions";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: "Holocron Portal",
	description: "The Data Documentation Platform - Find, understand, and trust your data",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<body className="antialiased min-h-screen flex flex-col bg-background text-foreground">
				<GalaxyBackground />
				<QueryProvider>
					<Header />
					{children}
					<ExtensionHost />
					<PluginsExtensionAdapter />
					<CommandPalette />
					<KeyboardHelp />
					<WizardHost />
					<Toaster position="bottom-right" richColors closeButton />
				</QueryProvider>
			</body>
		</html>
	);
}
