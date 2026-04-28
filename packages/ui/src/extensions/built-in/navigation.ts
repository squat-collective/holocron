import { Send } from "lucide-react";
import { MapIcon } from "@/lib/icons";
import type { Extension } from "../types";

/**
 * Navigation — global commands that take the user somewhere. The handler
 * uses `window.location.assign` rather than a router push so the extension
 * stays a pure data structure (no React hooks). Same end-user effect for
 * non-interactive routes.
 */
export const navigationExtension: Extension = {
	id: "navigation",
	name: "Navigation",
	description: "Jump between top-level views.",
	commands: () => [
		{
			id: "open-map",
			label: "Open the galaxy map",
			hint: "3D view of every asset",
			keywords: ["map", "graph", "visualisation", "3d", "explore", "g m"],
			group: "Navigate",
			icon: MapIcon,
			order: 10,
			run: () => {
				window.location.assign("/?mode=map");
			},
		},
		{
			id: "open-webhooks",
			label: "Manage webhooks",
			hint: "Outbound subscriptions for catalog events",
			keywords: [
				"webhooks",
				"webhook",
				"settings",
				"integrations",
				"hooks",
				"events",
				"subscribers",
			],
			group: "Navigate",
			icon: Send,
			order: 20,
			run: () => {
				window.location.assign("/settings/webhooks");
			},
		},
	],
};
