"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Compass, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import type { CatalogHit } from "@/hooks/use-catalog-search";
import { useGraphMap } from "@/hooks/use-graph-map";
import {
	getActorTypeIcon,
	getAssetTypeIcon,
	type LucideIcon,
	RuleIcon,
} from "@/lib/icons";
import {
	type FgNode,
	GalaxyScene,
	hrefFor,
	isBubble,
} from "./galaxy-scene";
import { MapPerfOverlay } from "./map-perf-overlay";

const SHOW_PERF_OVERLAY = process.env.NODE_ENV === "development";

/**
 * GalaxyMap — React shell over the imperative `GalaxyScene` engine.
 *
 * The component does only React-shaped work:
 *   - Mounts a single `GalaxyScene` and disposes it on unmount.
 *   - Holds React state for hover / lock / keyboard-focus / active hit
 *     so the overlays (info panel, hover card, locked chips) can
 *     re-render off them.
 *   - Pushes those state changes into the engine via setters
 *     (`setData`, `setFocus`, `flyTo`, `recenter`).
 *   - Subscribes to engine events (`hover`, `click`) to keep the
 *     React state honest and to route real-node clicks.
 *
 * Everything 3D — three.js, the WebGL canvas, the CSS2D label layer,
 * the budget pass, the LOD pipeline — lives in `galaxy-scene.tsx`.
 * If you're looking for a piece of the renderer, look there.
 */

/** Map a search hit back to the graph node we should focus on. */
function nodeIdForHit(hit: CatalogHit): string {
	switch (hit.kind) {
		case "asset":
		case "actor":
		case "rule":
			return hit.uid;
		case "container":
		case "field":
			return hit.asset_uid;
	}
}

/**
 * Imperative API the parent reaches for from outside the canvas — the
 * search input lives there and needs to drive locking + recentering
 * without managing the rest of the map's internal state.
 */
export interface GalaxyMapHandle {
	/**
	 * Toggle the lock state for the node corresponding to a search hit.
	 * Used by the home page's Shift+Enter handler when in map mode.
	 */
	toggleLockHit: (hit: CatalogHit) => void;
	/** Reset the camera to fit the whole graph. */
	recenter: () => void;
}

export interface GalaxyMapProps {
	/**
	 * Currently active search hit — drives the on-map focus mode and a
	 * camera fly to its 1-hop neighbourhood. Null = no search-driven
	 * focus (free navigation), but locked nodes + mouse hover still
	 * show their own focus emphasis.
	 */
	activeHit?: CatalogHit | null;
}

export const GalaxyMap = forwardRef<GalaxyMapHandle, GalaxyMapProps>(
	function GalaxyMap({ activeHit = null }, ref) {
		const router = useRouter();
		const containerRef = useRef<HTMLDivElement | null>(null);
		// The scene mounts the WebGL canvas + the CSS2D label layer
		// directly into a child div the library owns end-to-end. The
		// outer `containerRef` div hosts React-managed overlays
		// (spinner, nebulae, hover card, locked chips, legend, etc.)
		// — keeping those in their own React subtree avoids React's
		// DOM-deletion paths colliding with the library's canvas
		// mutations on commit.
		const sceneMountRef = useRef<HTMLDivElement | null>(null);
		const sceneRef = useRef<GalaxyScene | null>(null);
		const { data, isLoading } = useGraphMap(1);

		// Hovered node — drives the info panel + cursor card. Updated
		// when the engine emits a 'hover' event (real-node hits only;
		// bubbles get a separate hover affordance).
		const [hoveredNode, setHoveredNode] = useState<FgNode | null>(null);

		// Keyboard-driven focus — arrow-selected hit drives the same
		// edge glow + camera fly the mouse hover does. Mouse hover wins
		// so the cursor always feels in control when it's actually
		// moving.
		const [keyboardFocusNode, setKeyboardFocusNode] =
			useState<FgNode | null>(null);

		// Locked nodes — pinned focus seeds. Hover + keyboard focus
		// still add transient seeds on top, so the focus set is always
		// `{locked ∪ hovered ∪ keyboardFocus}`. Press Enter while a
		// node is hovered to toggle its lock.
		const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());

		const toggleLock = useCallback((id: string) => {
			setLockedIds((s) => {
				const next = new Set(s);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			});
		}, []);
		const unlock = useCallback((id: string) => {
			setLockedIds((s) => {
				if (!s.has(id)) return s;
				const next = new Set(s);
				next.delete(id);
				return next;
			});
		}, []);
		const clearLocks = useCallback(() => setLockedIds(new Set()), []);

		// Mount the engine exactly once per component instance. Strict
		// Mode runs effects twice in dev — `unmount()` is idempotent
		// and `mount()` throws if double-mounted, so the second pass
		// simply gets a fresh instance.
		useEffect(() => {
			const mount = sceneMountRef.current;
			if (!mount) return;
			const scene = new GalaxyScene();
			scene.mount(mount);
			sceneRef.current = scene;
			// Push current data immediately if it's already in cache —
			// the data effect won't re-fire on a StrictMode remount
			// (its dep is unchanged), so without this the library would
			// be left empty after the second mount.
			if (dataRef.current) scene.setData(dataRef.current);

			const offHover = scene.on("hover", (n) => {
				setHoveredNode(n && !isBubble(n) ? (n as FgNode) : null);
			});
			const offClick = scene.on("click", (n) => {
				if (isBubble(n)) return;
				router.push(hrefFor(n));
			});

			return () => {
				offHover();
				offClick();
				scene.unmount();
				sceneRef.current = null;
			};
		}, [router]);

		// Mirror of `data` readable from the mount effect's closure
		// without making `data` a dependency. Lets a StrictMode-driven
		// remount sync the freshly-mounted scene to whatever the cache
		// already has.
		const dataRef = useRef(data);
		dataRef.current = data;

		// Push new data into the engine whenever the query resolves.
		useEffect(() => {
			if (!data) return;
			sceneRef.current?.setData(data);
		}, [data]);

		// Compose the seed set from hover + lock + keyboard focus and
		// push to the engine. The engine derives the focus set + tier
		// dim + label LOD off this single setter.
		const seedIds = useMemo<Set<string>>(() => {
			const s = new Set<string>(lockedIds);
			if (hoveredNode) s.add(hoveredNode.id);
			if (keyboardFocusNode) s.add(keyboardFocusNode.id);
			return s;
		}, [lockedIds, hoveredNode, keyboardFocusNode]);

		useEffect(() => {
			sceneRef.current?.setFocus(seedIds);
		}, [seedIds]);

		// Active-hit (parent-driven search) → resolve a node + fly the
		// camera. The engine `getNode` helper synthesises a full FgNode
		// (with palette colour) even for off-screen hits so the panel
		// has everything it needs to render.
		useEffect(() => {
			const scene = sceneRef.current;
			if (!activeHit || !scene || !data) {
				setKeyboardFocusNode(null);
				return;
			}
			const id = nodeIdForHit(activeHit);
			const node = scene.getNode(id);
			if (!node) return;
			setKeyboardFocusNode(node);
			scene.flyTo([id], 1.4);
		}, [activeHit, data]);

		// Imperative API — the search bar uses this to toggle locks +
		// recenter without owning any of the map's internal state.
		useImperativeHandle(
			ref,
			() => ({
				toggleLockHit: (hit: CatalogHit) => toggleLock(nodeIdForHit(hit)),
				recenter: () => sceneRef.current?.recenter(),
			}),
			[toggleLock],
		);

		// Document-level Shift+Enter while a node is hovered → toggle
		// its lock. Works regardless of which element has focus so the
		// user can be typing in the search input and still pin a hovered
		// node.
		useEffect(() => {
			if (!hoveredNode) return;
			const onKey = (e: KeyboardEvent) => {
				if (e.key !== "Enter" || !e.shiftKey) return;
				e.preventDefault();
				toggleLock(hoveredNode.id);
			};
			document.addEventListener("keydown", onKey);
			return () => document.removeEventListener("keydown", onKey);
		}, [hoveredNode, toggleLock]);

		const lockedNodes = useMemo(() => {
			const scene = sceneRef.current;
			if (!scene) return [];
			const out: FgNode[] = [];
			for (const id of lockedIds) {
				const n = scene.getNode(id);
				if (n) out.push(n);
			}
			return out;
		}, [lockedIds]);

		const activePanelNode = hoveredNode ?? keyboardFocusNode;

		// The map container is always rendered so `sceneMountRef`
		// attaches on first commit — the engine's mount effect needs
		// the element on the very first run, otherwise it bails (its
		// deps don't include the ref, so it never re-fires when the
		// element later appears). The spinner becomes a transient
		// overlay.
		return (
			<div
				ref={containerRef}
				className="relative isolate w-full h-full overflow-hidden rounded-xl bg-[#050613]"
			>
				{/* Dedicated mount target for the imperative scene. The
				    library appends canvas + CSS2D divs into here; React
				    never enters this subtree, which keeps its DOM-
				    deletion paths from racing the library's mutations
				    on commits affecting the surrounding overlays. */}
				<div ref={sceneMountRef} className="absolute inset-0" />
				{isLoading && (
					<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#050613]/85">
						<GalaxySpinner size={220} label="Charting the galaxy…" />
					</div>
				)}
				{/* Ambient nebulae — same drifting milky-way look as the page
				    background, scoped to the map. `screen` blend in CSS adds
				    nebula colour to the dark canvas without dimming nodes. */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
				>
					<div className="nebula nebula-1" />
					<div className="nebula nebula-2" />
					<div className="nebula nebula-3" />
				</div>

				{/* Top-left overlay — active node info card on top, locked
				    chip stack below. Active node prefers hover (immediate
				    attention) and falls back to the keyboard-selected
				    search hit so the panel always reflects what the user
				    is "looking at" without needing the mouse. */}
				{(activePanelNode || lockedIds.size > 0) && (
					<div className="pointer-events-auto absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-xs">
						{activePanelNode && (
							<NodeInfoPanel
								node={activePanelNode}
								onOpen={() => router.push(hrefFor(activePanelNode))}
							/>
						)}
						{lockedNodes.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{lockedNodes.map((node) => (
									<button
										key={node.id}
										type="button"
										onClick={() => unlock(node.id)}
										title={`Unlock ${node.label}`}
										className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/80 backdrop-blur-sm px-2.5 py-1 text-xs text-foreground hover:bg-background/95 transition-colors shadow-lg shadow-primary/10"
									>
										<span
											className="size-2 rounded-full"
											style={{ backgroundColor: node.color }}
										/>
										<span className="max-w-[160px] truncate">
											{node.label}
										</span>
										<X className="size-3 opacity-60" />
									</button>
								))}
								{lockedNodes.length > 1 && (
									<button
										type="button"
										onClick={clearLocks}
										className="inline-flex items-center rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
									>
										Clear all
									</button>
								)}
							</div>
						)}
					</div>
				)}

				{SHOW_PERF_OVERLAY && <MapPerfOverlay sceneRef={sceneRef} />}

				{/* Recenter button — top right of the map pane. */}
				<button
					type="button"
					onClick={() => sceneRef.current?.recenter()}
					className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/65 backdrop-blur-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors shadow-lg shadow-primary/10"
					aria-label="Recenter the map"
				>
					<Compass className="size-3.5" />
					Recenter
				</button>

				{/* Cursor-following hover card — only when hovering a node.
				    HoverCard tracks the cursor via a DOM listener on
				    `containerRef`, so this component never re-renders on
				    mousemove. */}
				{hoveredNode && (
					<HoverCard node={hoveredNode} containerRef={containerRef} />
				)}

				<MapLegend />

				{/* Footer hint — passive controls reminder */}
				<div className="pointer-events-none absolute bottom-3 right-3 text-[10px] text-muted-foreground/70 text-right leading-snug">
					<div>drag pan · scroll zoom (to cursor)</div>
					<div>arrows pan · shift+arrows rotate</div>
				</div>
			</div>
		);
	},
);

// ============================================================================
// Overlays — pure React, decoupled from the engine.
// ============================================================================

/**
 * Loosely-typed shape for a fetched entity detail — every kind shares
 * a few common fields (description) and adds its own (location/status
 * for assets, email for people, category for rules). All fields are
 * optional so the same hook covers asset / actor / rule.
 */
interface NodeDetail {
	description?: string | null;
	location?: string | null;
	status?: string | null;
	email?: string | null;
	category?: string | null;
}

/**
 * Fetches the entity detail for a graph node. Cached 5 min by
 * TanStack so hovering the same node twice is free, and dedup'd so
 * arrow-key skimming doesn't fire a request per keystroke.
 */
function useNodeDetail(node: FgNode | null) {
	return useQuery<NodeDetail | null>({
		queryKey: ["graph-node-detail", node?.kind, node?.id],
		queryFn: async () => {
			if (!node) return null;
			const path =
				node.kind === "asset"
					? "assets"
					: node.kind === "actor"
						? "actors"
						: "rules";
			const r = await fetch(`/api/holocron/${path}/${node.id}`);
			if (!r.ok) return null;
			return r.json();
		},
		enabled: !!node?.id,
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Top-left info card for the currently "active" node — what the user
 * is hovering or keyboard-selecting. The basics (icon, name, kind,
 * connection count) come from the graph-map payload synchronously;
 * description + kind-specific fields stream in once the entity-detail
 * fetch resolves.
 */
function NodeInfoPanel({
	node,
	onOpen,
}: {
	node: FgNode;
	onOpen: () => void;
}) {
	const { data: detail } = useNodeDetail(node);
	let Icon: LucideIcon;
	if (node.kind === "asset") Icon = getAssetTypeIcon(node.subtype);
	else if (node.kind === "actor") Icon = getActorTypeIcon(node.subtype);
	else Icon = RuleIcon;
	const isAsset = node.kind === "asset";
	const isPerson = node.kind === "actor" && node.subtype === "person";
	const isRule = node.kind === "rule";
	return (
		<div className="rounded-xl border border-primary/25 bg-background/85 backdrop-blur-sm shadow-lg shadow-primary/10 px-4 py-3 space-y-1.5">
			<div className="flex items-center gap-2 min-w-0">
				<Icon className="size-4 shrink-0" style={{ color: node.color }} />
				<span className="font-medium text-sm truncate">{node.label}</span>
			</div>
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 flex-wrap">
				<span>{node.kind}</span>
				<span aria-hidden>·</span>
				<span>{node.subtype}</span>
				<span aria-hidden>·</span>
				<span>
					{node.degree} link{node.degree === 1 ? "" : "s"}
				</span>
				{isAsset && detail?.status && detail.status !== "active" && (
					<>
						<span aria-hidden>·</span>
						<span className="text-amber-500">{detail.status}</span>
					</>
				)}
				{isRule && detail?.category && (
					<>
						<span aria-hidden>·</span>
						<span>{detail.category}</span>
					</>
				)}
			</div>
			{detail?.description && (
				<p className="text-xs text-muted-foreground/90 line-clamp-3 leading-snug">
					{detail.description}
				</p>
			)}
			{isAsset && detail?.location && (
				<div className="text-[10px] font-mono text-muted-foreground/80 truncate">
					{detail.location}
				</div>
			)}
			{isPerson && detail?.email && (
				<a
					href={`mailto:${detail.email}`}
					className="block text-xs text-primary hover:underline truncate"
					onClick={(e) => e.stopPropagation()}
				>
					{detail.email}
				</a>
			)}
			<button
				type="button"
				onClick={onOpen}
				className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-0.5"
			>
				View details
				<ArrowRight className="size-3" />
			</button>
		</div>
	);
}

/**
 * Small floating card pinned just below the cursor while a node is
 * hovered.
 *
 * The card tracks the cursor via a DOM listener that mutates inline
 * styles directly on the wrapper div — pulling the cursor through
 * React state at 60 Hz on the parent re-rendered the whole canvas
 * tree, which was the single biggest cause of the original lag in #25.
 * With a ref-driven update only this tiny wrapper changes per frame.
 */
function HoverCard({
	node,
	containerRef,
}: {
	node: FgNode;
	containerRef: React.RefObject<HTMLDivElement | null>;
}) {
	const cardRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const card = cardRef.current;
		const container = containerRef.current;
		if (!card || !container) return;
		const onMove = (e: MouseEvent) => {
			const rect = container.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			card.style.left = `${x + 14}px`;
			card.style.top = `${y + 14}px`;
			if (card.style.opacity !== "1") card.style.opacity = "1";
		};
		const onLeave = () => {
			card.style.opacity = "0";
		};
		container.addEventListener("mousemove", onMove);
		container.addEventListener("mouseleave", onLeave);
		return () => {
			container.removeEventListener("mousemove", onMove);
			container.removeEventListener("mouseleave", onLeave);
		};
	}, [containerRef]);

	return (
		<div
			ref={cardRef}
			className="pointer-events-none absolute z-10 rounded-md border border-primary/25 bg-background/90 backdrop-blur-sm px-3 py-2 shadow-xl shadow-primary/10 transition-opacity duration-75"
			style={{
				// Hidden until first mousemove writes the position; otherwise
				// the card flashes at (0,0) for one frame on hover-enter.
				left: -9999,
				top: -9999,
				opacity: 0,
				maxWidth: 240,
			}}
		>
			<div className="flex items-center gap-2">
				<span
					className="inline-block size-2.5 rounded-full"
					style={{ backgroundColor: node.color }}
				/>
				<span className="font-medium text-sm text-foreground truncate">
					{node.label}
				</span>
			</div>
			<div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
				{node.kind} · {node.subtype} · {node.degree} link
				{node.degree === 1 ? "" : "s"}
			</div>
			<div className="mt-1.5 text-[10px] text-muted-foreground/80">
				<kbd className="font-mono px-1 rounded border border-primary/20 bg-card/60">
					⇧↵
				</kbd>{" "}
				lock · click opens
			</div>
		</div>
	);
}

function MapLegend() {
	const nodes: { label: string; cssVar: string }[] = [
		{ label: "System", cssVar: "--asset-system" },
		{ label: "Dataset", cssVar: "--asset-dataset" },
		{ label: "Report", cssVar: "--asset-report" },
		{ label: "Process", cssVar: "--asset-process" },
		{ label: "Team", cssVar: "--actor-group" },
		{ label: "Person", cssVar: "--actor-person" },
		{ label: "Rule", cssVar: "--severity-warning" },
	];
	const relations: { label: string; cssVar: string }[] = [
		{ label: "Owns", cssVar: "--relation-owns" },
		{ label: "Uses", cssVar: "--relation-uses" },
		{ label: "Feeds", cssVar: "--relation-feeds" },
		{ label: "Contains", cssVar: "--relation-contains" },
		{ label: "Member of", cssVar: "--relation-member-of" },
		{ label: "Applies to", cssVar: "--relation-applies-to" },
	];
	return (
		<div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 text-[11px] max-w-[60%]">
			<div className="flex flex-wrap gap-1.5">
				{nodes.map((e) => (
					<span
						key={e.label}
						className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-card/70 px-2 py-0.5"
					>
						<span
							className="size-2 rounded-full"
							style={{ backgroundColor: `var(${e.cssVar})` }}
						/>
						<span className="text-muted-foreground">{e.label}</span>
					</span>
				))}
				<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-card/70 px-2 py-0.5 text-muted-foreground/80">
					hubs glow brighter
				</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{relations.map((e) => (
					<span
						key={e.label}
						className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-card/70 px-2 py-0.5"
					>
						<span
							className="block h-[2px] w-3.5 rounded-full"
							style={{ backgroundColor: `var(${e.cssVar})` }}
						/>
						<span className="text-muted-foreground">{e.label}</span>
					</span>
				))}
			</div>
		</div>
	);
}
