"use client";

import dynamic from "next/dynamic";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import type { GalaxyMapHandle, GalaxyMapProps } from "./galaxy-map";

// `react-force-graph-3d` + three.js touch `window` and WebGL — keep the
// whole canvas out of the server bundle. Consumers are client components
// anyway, so this is just to skip SSR and shrink the entry bundle.
export const GalaxyMap = dynamic<GalaxyMapProps & { ref?: React.Ref<GalaxyMapHandle> }>(
	() =>
		import("./galaxy-map").then(
			(m) =>
				m.GalaxyMap as unknown as React.ComponentType<
					GalaxyMapProps & { ref?: React.Ref<GalaxyMapHandle> }
				>,
		),
	{
		ssr: false,
		loading: () => (
			<div className="flex-1 min-h-0 rounded-xl border border-primary/15 bg-card/30 flex items-center justify-center">
				<GalaxySpinner size={220} label="Charting the galaxy…" />
			</div>
		),
	},
);
