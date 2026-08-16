"use client";

/**
 * GalaxyScene — non-React engine that owns the 3D map's scene state.
 *
 * The React shell (`galaxy-map.tsx`) is a thin overlay layer:
 *   - It instantiates a single `GalaxyScene` on mount and disposes on
 *     unmount.
 *   - It pushes data + state changes through setters
 *     (`setData`, `setFocus`, `setExpansion`, `flyTo`, `recenter`).
 *   - It subscribes to scene events (`hover`, `click`, `cameraChange`)
 *     to drive the React-side overlays (info panel, hover card, locked
 *     chips).
 *
 * Everything that touches three.js, the WebGL canvas, the CSS2DRenderer
 * label layer, the budget pass, the per-frame LOD pass, and the camera
 * lives here. The React tree is unaware of any of it.
 *
 * Built on `3d-force-graph` (the imperative library that
 * `react-force-graph-3d` wraps) — same engine, same visuals, no React
 * inside the engine class.
 */

import type {
	GraphCluster,
	GraphMap,
	GraphNode,
} from "@squat-collective/holocron-ts";
import ForceGraph3D, {
	type ForceGraph3DInstance,
} from "3d-force-graph";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import {
	CSS2DObject,
	CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
	getActorTypeIcon,
	getAssetTypeIcon,
	type LucideIcon,
	RuleIcon,
} from "@/lib/icons";
import {
	computeExpansion,
	indexByCluster,
} from "./cluster-budget";
import { EdgeIndex } from "./edge-index";
import { clustersInFrustum, createFrustumScratch } from "./frustum";
import { NodeSet } from "./node-set";
import {
	computeLabelOpacity,
	FOCUS_ALPHA,
	FOCUS_HALO_ALPHA,
	FOCUS_MESH_ALPHA,
	focusTierFor,
	LOD_DEFAULTS,
} from "./lod";

// ============================================================================
// Types — exported so the React shell can refer to nodes by their library
// shape without re-declaring them.
// ============================================================================

export interface Palette {
	dataset: string;
	report: string;
	process: string;
	system: string;
	person: string;
	group: string;
	rule_info: string;
	rule_warning: string;
	rule_critical: string;
	rel_owns: string;
	rel_uses: string;
	rel_feeds: string;
	rel_contains: string;
	rel_member_of: string;
	rel_applies_to: string;
}

/** Force-graph node shape — extends the API node with library mutations. */
export interface FgNode extends GraphNode {
	fx: number;
	fy: number;
	fz: number;
	val: number;
	color: string;
}

/** Synthetic node representing a collapsed cluster (drawn as one bubble). */
export interface FgClusterBubble {
	id: string;
	fx: number;
	fy: number;
	fz: number;
	val: number;
	color: string;
	_bubble: true;
	_clusterId: string;
	_clusterLabel: string;
	_clusterKind: GraphCluster["kind"];
	_memberCount: number;
	_degree: number;
}
export type FgAnyNode = FgNode | FgClusterBubble;

export function isBubble(n: FgAnyNode): n is FgClusterBubble {
	return (n as FgClusterBubble)._bubble === true;
}

/** Resolved per-link visual style. Refreshed in place on focus change. */
export interface LinkStyle {
	color: string;
	width: number;
	particles: number;
	particleWidth: number;
	particleColor: string;
}

export interface FgLink {
	source: string;
	target: string;
	type: string;
	weight?: number;
	_style?: LinkStyle;
}

/** Everything we hold per node beyond what 3d-force-graph caches itself. */
interface SceneNode {
	group: THREE.Group;
	labelEl: HTMLElement;
	labelObj: CSS2DObject;
	coreMat: THREE.MeshBasicMaterial | null;
	haloMat: THREE.SpriteMaterial | null;
	degree: number;
	/**
	 * Last quantized opacity bucket written to the label DOM. Used to
	 * skip redundant `.style.opacity = ...` assignments during the
	 * per-frame LOD pass — at scale, every saved layout invalidation
	 * is real budget back. -1 means "never written yet."
	 */
	lastOpacityBucket: number;
	/**
	 * Last interactive state ('auto' or 'none') written to the label
	 * DOM. Same skip-when-unchanged rationale as `lastOpacityBucket`.
	 */
	lastInteractive: "auto" | "none" | null;
}

/**
 * Quantization levels for label opacity. With 16 buckets the visible
 * step is ~6% — smooth enough for the human eye on continuously-
 * changing distance LOD, but sparse enough that small camera nudges
 * usually keep most labels in the same bucket and skip the DOM write.
 */
const OPACITY_BUCKETS = 16;

// ============================================================================
// Module-level helpers — pure or near-pure (DOM probes for palette).
// ============================================================================

function readCssColor(cssVar: string, fallback: string): string {
	if (typeof window === "undefined") return fallback;
	const probe = document.createElement("span");
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.color = `var(${cssVar})`;
	document.body.appendChild(probe);
	const computed = getComputedStyle(probe).color;
	document.body.removeChild(probe);
	if (!computed || computed === "rgba(0, 0, 0, 0)") return fallback;

	// Convert through canvas to handle wide-gamut `color(srgb …)` outputs
	// — three.js chokes on that form. Canvas always returns 8-bit sRGB.
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return fallback;
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = computed;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	if (a === 0) return fallback;
	return `rgb(${r}, ${g}, ${b})`;
}

/** Resolve the palette from CSS custom properties. Run once on mount. */
export function resolvePalette(): Palette {
	return {
		dataset: readCssColor("--asset-dataset", "#4fc3f7"),
		report: readCssColor("--asset-report", "#ffb74d"),
		process: readCssColor("--asset-process", "#ba68c8"),
		system: readCssColor("--asset-system", "#81c784"),
		person: readCssColor("--actor-person", "#64b5f6"),
		group: readCssColor("--actor-group", "#e57373"),
		rule_info: readCssColor("--severity-info", "#90a4ae"),
		rule_warning: readCssColor("--severity-warning", "#ffb74d"),
		rule_critical: readCssColor("--severity-critical", "#e57373"),
		rel_owns: readCssColor("--relation-owns", "#5dac76"),
		rel_uses: readCssColor("--relation-uses", "#69b6c4"),
		rel_feeds: readCssColor("--relation-feeds", "#5b9bd5"),
		rel_contains: readCssColor("--relation-contains", "#c75bd1"),
		rel_member_of: readCssColor("--relation-member-of", "#5fbab2"),
		rel_applies_to: readCssColor("--relation-applies-to", "#d65bbb"),
	};
}

function relationColor(type: string, palette: Palette): string {
	switch (type) {
		case "owns":
			return palette.rel_owns;
		case "uses":
			return palette.rel_uses;
		case "feeds":
			return palette.rel_feeds;
		case "contains":
			return palette.rel_contains;
		case "member_of":
			return palette.rel_member_of;
		case "applies_to":
			return palette.rel_applies_to;
		default:
			return "rgb(180, 180, 220)";
	}
}

function withAlpha(rgb: string, alpha: number): string {
	const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(rgb);
	if (!m) return rgb;
	return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

function colorFor(node: GraphNode, palette: Palette): string {
	if (node.kind === "asset") {
		switch (node.subtype) {
			case "dataset":
				return palette.dataset;
			case "report":
				return palette.report;
			case "process":
				return palette.process;
			case "system":
				return palette.system;
		}
	}
	if (node.kind === "actor") {
		return node.subtype === "group" ? palette.group : palette.person;
	}
	if (node.kind === "rule") {
		switch (node.subtype) {
			case "critical":
				return palette.rule_critical;
			case "warning":
				return palette.rule_warning;
			default:
				return palette.rule_info;
		}
	}
	return "#888";
}

/** Lucide icon → SVG string. Cached per (kind, subtype). */
const iconCache = new Map<string, string>();
function getIconSvg(kind: string, subtype: string): string {
	const key = `${kind}:${subtype}`;
	const cached = iconCache.get(key);
	if (cached) return cached;
	let Icon: LucideIcon;
	if (kind === "asset") Icon = getAssetTypeIcon(subtype);
	else if (kind === "actor") Icon = getActorTypeIcon(subtype);
	else Icon = RuleIcon;
	const svg = renderToStaticMarkup(<Icon size={11} strokeWidth={2.4} />);
	iconCache.set(key, svg);
	return svg;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function hrefFor(node: GraphNode): string {
	switch (node.kind) {
		case "asset":
			return `/assets/${node.id}`;
		case "actor":
			return `/actors/${node.id}`;
		case "rule":
			return `/rules/${node.id}`;
	}
}

function linkEndpoints(l: {
	source: string | { id: string };
	target: string | { id: string };
}): { src: string; tgt: string } {
	return {
		src: typeof l.source === "string" ? l.source : l.source.id,
		tgt: typeof l.target === "string" ? l.target : l.target.id,
	};
}

function computeLinkStyle(
	link: FgLink,
	focusSet: ReadonlySet<string> | null,
	palette: Palette,
): LinkStyle {
	const { src, tgt } = linkEndpoints(link);
	const inFocus = !!focusSet && focusSet.has(src) && focusSet.has(tgt);
	const isAggregated = link.type === "aggregated";

	let color: string;
	if (isAggregated) {
		color = inFocus
			? "rgba(180, 180, 220, 0.9)"
			: "rgba(160, 160, 200, 0.45)";
	} else {
		const base = relationColor(link.type, palette);
		if (!focusSet) color = withAlpha(base, 0.45);
		else if (inFocus) color = withAlpha(base, 0.95);
		else color = withAlpha(base, 0.22);
	}

	let width: number;
	if (isAggregated && link.weight) {
		width = Math.min(6, 0.8 + Math.log1p(link.weight) * 0.9);
	} else if (!focusSet) {
		width = 0.7;
	} else {
		width = inFocus ? 1.6 : 0.5;
	}

	// Idle map: zero particles. Each animated particle is a moving
	// THREE mesh updated every frame — at ~50 edges that's 50 mesh
	// position writes per tick, perpetually, even when nothing is
	// happening. The `inFocus` band keeps the "active flow" cue (a
	// stream of dashes through the focused subgraph); off-focus links
	// stay static. Off-focus inside a focused mode shows 0 particles
	// to push attention onto the focused stream, not 1.
	const particles = isAggregated ? 0 : inFocus ? 8 : 0;
	const particleWidth = inFocus ? 5 : 0;
	const particleColor = relationColor(link.type, palette);

	return { color, width, particles, particleWidth, particleColor };
}

/** ±29° hue offset per cluster id so 16 system bubbles aren't all green. */
function clusterHueOffset(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = ((h << 5) - h + id.charCodeAt(i)) | 0;
	}
	return ((Math.abs(h) % 1000) / 1000) * 0.16 - 0.08;
}

/** Radial-gradient halo sprite — built once and shared by every node. */
let _haloTexture: THREE.Texture | null = null;
function getHaloTexture(): THREE.Texture {
	if (_haloTexture) return _haloTexture;
	const canvas = document.createElement("canvas");
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
		grad.addColorStop(0, "rgba(255,255,255,1)");
		grad.addColorStop(0.3, "rgba(255,255,255,0.45)");
		grad.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 128, 128);
	}
	_haloTexture = new THREE.CanvasTexture(canvas);
	return _haloTexture;
}

/** Build the three.js group + label for a collapsed-cluster bubble. */
function buildClusterBubble(bubble: FgClusterBubble): {
	group: THREE.Group;
	labelEl: HTMLElement;
	labelObj: CSS2DObject;
	haloMat: THREE.SpriteMaterial;
} {
	const baseColor = new THREE.Color(bubble.color);
	const hueShift = clusterHueOffset(bubble._clusterId);
	const color = baseColor.clone().offsetHSL(hueShift, 0, 0);
	const group = new THREE.Group();

	const radius = Math.max(8, bubble.val * 1.4);

	// Invisible hit sphere — bubbles are click targets ("expand this
	// cluster"), so the cursor doesn't have to hunt the centre.
	const hitGeo = new THREE.SphereGeometry(radius * 1.6, 12, 8);
	const hitMat = new THREE.MeshBasicMaterial({
		transparent: true,
		opacity: 0,
		depthWrite: false,
	});
	group.add(new THREE.Mesh(hitGeo, hitMat));

	// Soft additive halo — the only visible element. Reads as "area"
	// rather than "a point source", which is the whole point of a
	// bubble. Scale dropped from 6.5 → 4.5 (53% less screen area, so
	// 53% less fragment-shader work per bubble); on integrated GPUs
	// this is the single biggest fillrate cost since additive
	// blending touches every covered pixel regardless of alpha.
	const haloMat = new THREE.SpriteMaterial({
		map: getHaloTexture(),
		color,
		transparent: true,
		opacity: 0.5,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	});
	const halo = new THREE.Sprite(haloMat);
	halo.scale.set(radius * 4.5, radius * 4.5, 1);
	group.add(halo);

	const labelEl = document.createElement("div");
	labelEl.className = "galaxy-label galaxy-label-bubble";
	labelEl.dataset.nodeId = bubble.id;
	const nameSpan = document.createElement("span");
	nameSpan.textContent = bubble._clusterLabel;
	const countSpan = document.createElement("span");
	countSpan.className = "galaxy-label-count";
	countSpan.textContent = `${bubble._memberCount}`;
	labelEl.appendChild(nameSpan);
	labelEl.appendChild(countSpan);
	const labelObj = new CSS2DObject(labelEl);
	labelObj.position.set(0, radius * 1.2, 0);
	group.add(labelObj);
	return { group, labelEl, labelObj, haloMat };
}

// ============================================================================
// OrbitControls minimal interface — the library doesn't expose strict types
// for `controls()`, but at runtime it's three.js OrbitControls.
// ============================================================================

interface OrbitControlsLike {
	zoomSpeed?: number;
	rotateSpeed?: number;
	panSpeed?: number;
	enableDamping?: boolean;
	dampingFactor?: number;
	target?: THREE.Vector3;
	update?: () => void;
	mouseButtons?: { LEFT?: number; MIDDLE?: number; RIGHT?: number };
	zoomToCursor?: boolean;
	addEventListener?: (e: string, cb: () => void) => void;
	removeEventListener?: (e: string, cb: () => void) => void;
}

// ============================================================================
// Event bus types
// ============================================================================

export interface GalaxySceneEvents {
	hover: (node: FgAnyNode | null) => void;
	click: (node: FgAnyNode) => void;
	cameraChange: () => void;
}

type Listeners = {
	[K in keyof GalaxySceneEvents]: Set<GalaxySceneEvents[K]>;
};

// ============================================================================
// Stats — exposed via getStats() for the dev perf overlay.
// ============================================================================

/**
 * Per-phase frame budget + visible-set + GPU info. Consumed by the
 * dev-mode `<MapPerfOverlay>`; kept in plain numbers so the overlay's
 * polling loop is a cheap struct read with no allocation pressure.
 *
 * Each `*Ms` is the duration (in ms) of the *most recent* invocation of
 * that phase, not a running average — hot phases fire often enough
 * that a per-frame sample is more representative than any smoothing.
 */
export interface GalaxySceneStats {
	lodMs: number;
	restyleLinksMs: number;
	budgetMs: number;
	rebuildMs: number;
	realNodes: number;
	bubbles: number;
	links: number;
	drawCalls: number;
	triangles: number;
	/** True while the library's animation cycle is parked. Confirms
	 * the idle-pause is taking effect (frame counters from the
	 * overlay then drop to ~0). */
	paused: boolean;
}

// ============================================================================
// GalaxyScene
// ============================================================================

export class GalaxyScene {
	// --- Mounted state ----------------------------------------------------
	private container: HTMLElement | null = null;
	private fg: ForceGraph3DInstance<FgAnyNode, FgLink> | null = null;
	private cssRenderer: CSS2DRenderer | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private orbitChangeHandler: (() => void) | null = null;
	private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
	private containerOverHandler: ((e: MouseEvent) => void) | null = null;
	private containerOutHandler: ((e: MouseEvent) => void) | null = null;
	private containerClickHandler: ((e: MouseEvent) => void) | null = null;
	private mouseLeaveHandler: (() => void) | null = null;
	private mouseMoveHandler: (() => void) | null = null;

	// --- Data ------------------------------------------------------------
	private data: GraphMap | null = null;
	private adjacency = new Map<string, Set<string>>();
	private nodeClusterMap = new Map<string, string | null | undefined>();
	private clusters: GraphCluster[] = [];
	private clusterIndex: ReturnType<typeof indexByCluster> = {
		loose: [],
		byCluster: new Map(),
	};

	// --- Live state ------------------------------------------------------
	private expanded = new Set<string>();
	private pinned = new Set<string>();
	private surfaced = new Set<string>();
	private seedIds: Set<string> | null = null;
	private focusSet: Set<string> | null = null;
	private lastClusterChange = new Map<string, number>();

	// --- Registries ------------------------------------------------------
	private sceneNodes = new Map<string, SceneNode>();
	private currentLinks: FgLink[] = [];
	private currentNodes: FgAnyNode[] = [];
	// Incremental edge aggregator. Refreshed lazily on rebuildGraph
	// via setState — the index migrates only the affected nodes, not
	// the whole edge list.
	private edgeIndex = new EdgeIndex();
	// Incremental visible-node + bubble tracker. Same shape, same
	// motivation as `edgeIndex` but for the node side. Pre-bakes every
	// FgNode + FgClusterBubble on `setData`; `setState` flips entries
	// in/out of the visible maps in O(changed).
	private nodeSet = new NodeSet();

	// --- Frame loop ------------------------------------------------------
	private framePending = false;

	// --- Idle pause -----------------------------------------------------
	// 3d-force-graph runs an rAF cycle perpetually even with nothing
	// to update. With particles=0 by default and no camera motion,
	// idle frames are pure overhead. We park the cycle after 500ms of
	// no interaction and wake on the next user gesture (mouse move,
	// camera change, focus / expansion setter, data load).
	//
	// When focus is active the scene stays animating: the focused
	// edges have particles flowing and we don't want them to stutter.
	private isPaused = false;
	private idlePauseTimer: ReturnType<typeof setTimeout> | null = null;
	private static readonly IDLE_PAUSE_MS = 500;

	// --- Perf stats (dev overlay) ---------------------------------------
	// Updated inline by the hot-path methods. `getStats()` snapshots +
	// augments with library-side counters (draw calls, triangles).
	private statSamples = {
		lodMs: 0,
		restyleLinksMs: 0,
		budgetMs: 0,
		rebuildMs: 0,
	};

	// --- Palette + listeners --------------------------------------------
	private palette: Palette;
	private listeners: Listeners = {
		hover: new Set(),
		click: new Set(),
		cameraChange: new Set(),
	};

	// Reused scratch vector — avoids an allocation per node per frame in
	// the LOD pass. The LOD pass walks the whole sceneNodes map on every
	// camera nudge, so an alloc per call gets very real at scale.
	private readonly tmpVec = new THREE.Vector3();
	// Reused frustum/sphere scratch — populated each tick by
	// `clustersInFrustum`. One allocation per scene, not per tick.
	private readonly frustumScratch = createFrustumScratch();

	constructor() {
		// Palette resolution does DOM probes — defer until mount() so SSR
		// can still construct a scene object without crashing.
		this.palette = {
			dataset: "#4fc3f7",
			report: "#ffb74d",
			process: "#ba68c8",
			system: "#81c784",
			person: "#64b5f6",
			group: "#e57373",
			rule_info: "#90a4ae",
			rule_warning: "#ffb74d",
			rule_critical: "#e57373",
			rel_owns: "#5dac76",
			rel_uses: "#69b6c4",
			rel_feeds: "#5b9bd5",
			rel_contains: "#c75bd1",
			rel_member_of: "#5fbab2",
			rel_applies_to: "#d65bbb",
		};
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	mount(container: HTMLElement): void {
		if (this.container) {
			throw new Error("GalaxyScene already mounted");
		}
		this.container = container;
		this.palette = resolvePalette();

		// CSS2DRenderer overlays an HTML layer over the WebGL canvas so
		// every node label is a real <div>. Sized to match the container
		// via a ResizeObserver below.
		const cssRenderer = new CSS2DRenderer();
		cssRenderer.domElement.style.position = "absolute";
		cssRenderer.domElement.style.top = "0";
		cssRenderer.domElement.style.left = "0";
		cssRenderer.domElement.style.width = "100%";
		cssRenderer.domElement.style.height = "100%";
		cssRenderer.domElement.style.pointerEvents = "none";
		this.cssRenderer = cssRenderer;

		// Construct the imperative ForceGraph3D instance with the same
		// configuration the React wrapper used. The library returns a
		// chainable proxy — every setter returns the same instance.
		const fg = new (ForceGraph3D as unknown as new (
			el: HTMLElement,
			opts?: { extraRenderers?: THREE.Object3D[]; controlType?: string },
		) => ForceGraph3DInstance<FgAnyNode, FgLink>)(container, {
			extraRenderers: [cssRenderer as unknown as THREE.Object3D],
			controlType: "orbit",
		});
		this.fg = fg;

		fg.backgroundColor("#050613")
			.cooldownTicks(0)
			.warmupTicks(0)
			.nodeThreeObject((n) => this.buildNodeObject(n))
			.nodeThreeObjectExtend(false)
			.nodeLabel(() => "")
			.linkColor(
				(l) => (l as FgLink)._style?.color ?? "rgba(180,180,220,0.4)",
			)
			.linkWidth((l) => (l as FgLink)._style?.width ?? 0.7)
			.linkOpacity(1)
			.linkDirectionalParticles(
				(l) => (l as FgLink)._style?.particles ?? 0,
			)
			.linkDirectionalParticleSpeed(0.006)
			.linkDirectionalParticleWidth(
				(l) => (l as FgLink)._style?.particleWidth ?? 0,
			)
			// Particle = a single moving sphere on the edge. Default
			// `linkDirectionalParticleResolution` is 4. We only show
			// particles on focused edges (≤ 8 visible at a time); 3
			// is plenty smooth at that count and saves triangles.
			.linkDirectionalParticleResolution(3)
			.linkDirectionalParticleColor(
				(l) =>
					(l as FgLink)._style?.particleColor ?? "rgba(180,180,220,0.4)",
			)
			// Edges render as thick TubeGeometries — radial resolution
			// dominates the per-edge triangle count. 3 is the floor
			// (triangular cross-section) but reads as smooth at our
			// line widths and small viewport sizes; was the library's
			// 6-segment default.
			.linkResolution(3)
			.enableNodeDrag(false)
			.enableNavigationControls(true)
			.onNodeHover((n) => this.handleRaycasterHover(n))
			.onNodeClick((n) => this.handleClick(n));

		// OrbitControls tuning — Google-Maps-style: pan as primary
		// gesture, zoom-to-cursor, damped feel. Library mounts controls
		// asynchronously, so defer one tick.
		setTimeout(() => this.tuneControls(), 60);

		// Camera-change pipeline — single subscription, single rAF,
		// fixed phase order: budget recompute → LOD apply.
		this.attachOrbitListener();

		// CSS2DRenderer needs to know the container size. Sync now and
		// observe — without this the label DOM layer drifts on resize.
		const sync = () => {
			const rect = container.getBoundingClientRect();
			cssRenderer.setSize(rect.width, rect.height);
		};
		sync();
		this.resizeObserver = new ResizeObserver(sync);
		this.resizeObserver.observe(container);

		// Delegated label click + hover. CSS2DRenderer keeps the DOM
		// labels above the canvas; events on the container catch them.
		this.attachContainerListeners();

		// Keyboard navigation — arrow keys pan, Shift+arrows rotate.
		this.attachKeyboardListener();
	}

	unmount(): void {
		if (this.keydownHandler) {
			window.removeEventListener("keydown", this.keydownHandler);
			this.keydownHandler = null;
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.container) {
			if (this.containerOverHandler) {
				this.container.removeEventListener(
					"mouseover",
					this.containerOverHandler,
				);
			}
			if (this.containerOutHandler) {
				this.container.removeEventListener(
					"mouseout",
					this.containerOutHandler,
				);
			}
			if (this.containerClickHandler) {
				this.container.removeEventListener(
					"click",
					this.containerClickHandler,
				);
			}
			if (this.mouseLeaveHandler) {
				this.container.removeEventListener(
					"mouseleave",
					this.mouseLeaveHandler,
				);
			}
			if (this.mouseMoveHandler) {
				this.container.removeEventListener(
					"mousemove",
					this.mouseMoveHandler,
				);
			}
		}
		if (this.idlePauseTimer) {
			clearTimeout(this.idlePauseTimer);
			this.idlePauseTimer = null;
		}
		this.detachOrbitListener();

		if (this.fg) {
			try {
				this.fg._destructor();
			} catch {
				// Library cleanup occasionally throws on partial init —
				// nothing to do, we're tearing down anyway.
			}
			this.fg = null;
		}
		// Drop scene-graph references so any held three.js resources
		// can be GC'd. The destructor above disposes the WebGL state.
		// (NodeSet + EdgeIndex hold only data references; they get
		// dropped naturally if the GalaxyScene instance is collected.)
		this.sceneNodes.clear();
		this.currentLinks = [];
		this.currentNodes = [];
		this.cssRenderer = null;
		this.container = null;
	}

	// ====================================================================
	// Public API — state setters
	// ====================================================================

	setData(graph: GraphMap): void {
		this.data = graph;

		// Adjacency index — used by focus tier classification + camera fly.
		const adj = new Map<string, Set<string>>();
		for (const e of graph.edges) {
			if (!adj.has(e.source)) adj.set(e.source, new Set());
			if (!adj.has(e.target)) adj.set(e.target, new Set());
			adj.get(e.source)?.add(e.target);
			adj.get(e.target)?.add(e.source);
		}
		this.adjacency = adj;

		// Cluster lookup — used by the edge aggregator's repOf().
		const clusterMap = new Map<string, string | null | undefined>();
		for (const n of graph.nodes) clusterMap.set(n.id, n.cluster_id);
		this.nodeClusterMap = clusterMap;

		this.clusters = graph.clusters ?? [];
		this.clusterIndex = indexByCluster(graph.nodes);

		// Reset all derived state — registries get rebuilt by the next
		// rebuildGraph() call.
		this.sceneNodes.clear();
		// Hand the new graph to the incremental aggregators. Both will
		// repopulate live state from the current expansion + surfaced
		// sets when `setState` fires next.
		this.edgeIndex.setData(graph.edges, clusterMap, this.clusters);
		this.nodeSet.setData(graph, this.palette);
		// Don't clear `expanded` / `pinned` / `surfaced` — those are
		// driven by the React shell + the budget pass, and the user's
		// pinned-open clusters should survive a data refresh. The
		// budget pass below will drop any ids that no longer exist.

		// Initial budget pass — fits the visible set to the current
		// camera before any interaction.
		this.recomputeExpansionFromCamera();
		this.rebuildGraph();
		this.refitOnData();
		this.touchActivity();
	}

	setFocus(seeds: ReadonlySet<string>): void {
		const next = seeds.size === 0 ? null : new Set(seeds);
		// Cheap identity check first — focus rarely changes meaningfully.
		if (setsEqual(this.seedIds, next)) return;
		this.seedIds = next;
		this.focusSet = next ? this.deriveFocusSet(next) : null;
		// Surface = seeds only. Neighbours stay behind their bubbles.
		this.setSurfacedInternal(next);
		// Mutate link _style in place — never rebuild graphData on focus.
		this.restyleLinks();
		this.applyVisuals();
		this.touchActivity();
	}

	setExpansion(
		expanded: ReadonlySet<string>,
		pinned: ReadonlySet<string>,
	): void {
		this.expanded = new Set(expanded);
		this.pinned = new Set(pinned);
		this.rebuildGraph();
		this.touchActivity();
	}

	togglePin(clusterId: string): void {
		const wasPinned = this.pinned.has(clusterId);
		const nextPinned = new Set(this.pinned);
		if (wasPinned) nextPinned.delete(clusterId);
		else nextPinned.add(clusterId);
		this.pinned = nextPinned;

		const nextExpanded = new Set(this.expanded);
		if (wasPinned) nextExpanded.delete(clusterId);
		else nextExpanded.add(clusterId);
		this.expanded = nextExpanded;

		this.lastClusterChange.set(clusterId, performance.now());
		this.rebuildGraph();
		this.touchActivity();
	}

	flyTo(seedIds: Iterable<string>, fitFactor = 1.6): void {
		const fg = this.fg;
		if (!fg || !this.data) return;
		const ids = new Set<string>();
		for (const id of seedIds) {
			ids.add(id);
			const ns = this.adjacency.get(id);
			if (ns) for (const n of ns) ids.add(n);
		}
		if (ids.size === 0) return;

		// Centroid + bounding radius from the *full* dataset — surfaced
		// hits + neighbours haven't always landed in the visible set yet
		// at fly-to time.
		let cx = 0;
		let cy = 0;
		let cz = 0;
		let count = 0;
		for (const n of this.data.nodes) {
			if (!ids.has(n.id)) continue;
			cx += n.x;
			cy += n.y;
			cz += n.z;
			count += 1;
		}
		if (count === 0) return;
		cx /= count;
		cy /= count;
		cz /= count;
		let radius = 60; // floor — single isolated hit shouldn't snap too close
		for (const n of this.data.nodes) {
			if (!ids.has(n.id)) continue;
			const r = Math.hypot(n.x - cx, n.y - cy, n.z - cz);
			if (r > radius) radius = r;
		}

		const cam = fg.camera() as THREE.PerspectiveCamera;
		const fovRad = (cam.fov * Math.PI) / 180;
		const distance = (radius * fitFactor) / Math.sin(fovRad / 2);

		// Preserve the user's current view direction.
		const ctrl = fg.controls() as OrbitControlsLike;
		const dir = ctrl?.target
			? new THREE.Vector3().subVectors(cam.position, ctrl.target).normalize()
			: new THREE.Vector3(0, 0, 1);
		fg.cameraPosition(
			{
				x: cx + dir.x * distance,
				y: cy + dir.y * distance,
				z: cz + dir.z * distance,
			},
			{ x: cx, y: cy, z: cz },
			900,
		);
	}

	recenter(): void {
		this.fg?.zoomToFit(700, 80);
	}

	/**
	 * Resolve a node by id into the FgNode shape the React overlays
	 * read (label, kind, subtype, degree, color). Returns the cached
	 * reference when the node is currently visible; otherwise
	 * synthesizes one from the underlying data + resolved palette so
	 * the panel still has colour for an off-screen surfaced hit.
	 */
	getNode(id: string): FgNode | null {
		// NodeSet pre-bakes every FgNode on setData, so this lookup is
		// O(1) and works even for ids not currently in the visible set
		// (e.g. a search hit hiding behind a collapsed bubble).
		return (this.nodeSet.getFgNode(id) as FgNode) ?? null;
	}

	/**
	 * Snapshot per-phase frame timings + visible-set + GPU counters.
	 * Consumed by the dev-mode `<MapPerfOverlay>`. Cheap struct read —
	 * the timings are mutated inline by the hot-path methods, the
	 * counts are derived from existing live arrays, and the GPU info
	 * comes from three.js's per-frame `renderer.info.render` block
	 * (which the library updates each animation cycle).
	 */
	getStats(): GalaxySceneStats {
		let realNodes = 0;
		let bubbles = 0;
		for (const n of this.currentNodes) {
			if (isBubble(n)) bubbles++;
			else realNodes++;
		}
		const renderer = this.fg?.renderer() as
			| { info?: { render?: { calls?: number; triangles?: number } } }
			| undefined;
		const info = renderer?.info?.render;
		return {
			lodMs: this.statSamples.lodMs,
			restyleLinksMs: this.statSamples.restyleLinksMs,
			budgetMs: this.statSamples.budgetMs,
			rebuildMs: this.statSamples.rebuildMs,
			realNodes,
			bubbles,
			links: this.currentLinks.length,
			drawCalls: info?.calls ?? 0,
			triangles: info?.triangles ?? 0,
			paused: this.isPaused,
		};
	}

	/**
	 * Mark the scene as actively used. Wakes the library's animation
	 * cycle if it was parked, and (re-)schedules an idle pause for
	 * `IDLE_PAUSE_MS` from now. While focus is active we keep
	 * animating instead so focused-edge particles don't stutter.
	 */
	private touchActivity(): void {
		if (this.idlePauseTimer) {
			clearTimeout(this.idlePauseTimer);
			this.idlePauseTimer = null;
		}
		if (this.isPaused && this.fg) {
			this.fg.resumeAnimation();
			this.isPaused = false;
		}
		const focusActive = this.seedIds !== null && this.seedIds.size > 0;
		if (!focusActive) {
			this.idlePauseTimer = setTimeout(() => {
				if (!this.fg) return;
				this.fg.pauseAnimation();
				this.isPaused = true;
				this.idlePauseTimer = null;
			}, GalaxyScene.IDLE_PAUSE_MS);
		}
	}

	// ====================================================================
	// Event bus
	// ====================================================================

	on<K extends keyof GalaxySceneEvents>(
		event: K,
		cb: GalaxySceneEvents[K],
	): () => void {
		this.listeners[event].add(cb);
		return () => {
			this.listeners[event].delete(cb);
		};
	}

	private emit<K extends keyof GalaxySceneEvents>(
		event: K,
		...args: Parameters<GalaxySceneEvents[K]>
	): void {
		// Snapshot to avoid mutation-during-iteration if a handler unsubs
		// itself. With ~3 handlers per event in practice this is cheap.
		const snapshot = [...this.listeners[event]] as GalaxySceneEvents[K][];
		for (const cb of snapshot) {
			(cb as (...a: unknown[]) => void)(...args);
		}
	}

	// ====================================================================
	// Internal — scene rebuild
	// ====================================================================

	/**
	 * Rebuild the visible-node + aggregated-edge sets from the current
	 * data + expansion/surface state, hand them to the library, and
	 * reapply visuals. Called by setData / setExpansion / togglePin /
	 * the camera-change pipeline (when the budget mutates expansion).
	 */
	private rebuildGraph(): void {
		if (!this.data || !this.fg) return;
		const t0 = performance.now();

		// Visible nodes + bubbles via the incremental NodeSet —
		// O(changed cluster members + surfaced) per state transition,
		// not O(N) every call. Pre-baked references mean unchanged ids
		// stay identity-stable, so the library's internal bookkeeping
		// id-matches them and skips rebuilds.
		this.nodeSet.setState(this.expanded, this.surfaced);
		const realNodes = this.nodeSet.getRealNodes() as FgNode[];
		const bubbles = this.nodeSet.getBubbles() as FgClusterBubble[];

		// Incremental edge aggregation. The index migrates only nodes
		// whose rep changed since the last call (cluster members on a
		// flip, plus surfaced ids that flipped) — not the full edge
		// list. `getLinks()` is cached until `setState` invalidates it.
		this.edgeIndex.setState(this.expanded, this.surfaced);
		const links = this.edgeIndex.getLinks() as FgLink[];
		// Initial styling using the current focus.
		for (const link of links) {
			link._style = computeLinkStyle(link, this.focusSet, this.palette);
		}

		const nodes: FgAnyNode[] = [...realNodes, ...bubbles];
		this.currentNodes = nodes;
		this.currentLinks = links;

		this.fg.graphData({ nodes, links });
		this.statSamples.rebuildMs = performance.now() - t0;

		// Cleanup orphans + DOM sweep + LOD reapply once the library
		// has had a frame to call buildNodeObject on the new ids.
		requestAnimationFrame(() => {
			this.cleanupOrphans();
			this.applyVisuals();
		});
	}

	/**
	 * Drop registry entries (and orphan THREE.Groups) for ids that left
	 * the visible set. The library's own disposal doesn't reliably
	 * remove the Group from its scene parent — explicit detach here is
	 * what stops CSS2DRenderer from re-appending the orphan's label
	 * element every frame.
	 */
	private cleanupOrphans(): void {
		const validIds = new Set(this.currentNodes.map((n) => n.id));
		for (const id of [...this.sceneNodes.keys()]) {
			if (validIds.has(id)) continue;
			const entry = this.sceneNodes.get(id);
			if (entry?.group.parent) entry.group.parent.remove(entry.group);
			this.sceneNodes.delete(id);
		}
		// Document-wide sweep: detach any [data-node-id] DOM that isn't
		// one of the currently registered labels. Brutal but reliable.
		const validElements = new Set<HTMLElement>();
		for (const entry of this.sceneNodes.values()) {
			validElements.add(entry.labelEl);
		}
		const stale: Element[] = [];
		const allLabels = document.querySelectorAll<HTMLElement>("[data-node-id]");
		for (const el of allLabels) {
			if (!validElements.has(el)) stale.push(el);
		}
		for (const el of stale) el.remove();
	}

	/** Re-mutate every link's `_style` in place — no graphData rebuild. */
	private restyleLinks(): void {
		const t0 = performance.now();
		for (const link of this.currentLinks) {
			link._style = computeLinkStyle(link, this.focusSet, this.palette);
		}
		this.statSamples.restyleLinksMs = performance.now() - t0;
	}

	/**
	 * Per-frame visual update — focus tier dim + label LOD.
	 * Walks every registered node; mutates material opacities + label
	 * style without rebuilding three.js objects.
	 */
	private applyVisuals(): void {
		const fg = this.fg;
		if (!fg) return;
		const t0 = performance.now();
		const cam = fg.camera() as THREE.PerspectiveCamera;
		const camPos = cam.position;
		const tmp = this.tmpVec;
		const dNearSq = LOD_DEFAULTS.dNear * LOD_DEFAULTS.dNear;
		// Build the camera frustum once per pass — per-node containment
		// check is then ~free. Off-screen nodes get skipped entirely;
		// the next camera nudge that brings them back into view will
		// process them. Seed-tier nodes (locked / hovered / keyboard-
		// focused) are always processed regardless of frustum so a
		// search-flown lock that leaves the viewport stays correctly
		// rendered when the user pans back.
		const scratch = this.frustumScratch;
		scratch.matrix.multiplyMatrices(
			cam.projectionMatrix,
			cam.matrixWorldInverse,
		);
		scratch.frustum.setFromProjectionMatrix(scratch.matrix);

		const writeLabel = (
			entry: SceneNode,
			opacity: number,
		): void => {
			const bucket = Math.round(opacity * OPACITY_BUCKETS);
			if (bucket !== entry.lastOpacityBucket) {
				entry.labelEl.style.opacity = (bucket / OPACITY_BUCKETS).toFixed(3);
				entry.lastOpacityBucket = bucket;
			}
			const interactive: "auto" | "none" =
				opacity > 0.3 ? "auto" : "none";
			if (interactive !== entry.lastInteractive) {
				entry.labelEl.style.pointerEvents = interactive;
				entry.lastInteractive = interactive;
			}
		};

		this.sceneNodes.forEach((entry, id) => {
			const tier = focusTierFor(id, this.seedIds, this.adjacency);

			// Seed tier: ignore distance, ignore frustum — always
			// honour the user-pointed-at node. No sqrt, no world-
			// position read either; the alpha is constant.
			if (tier === "seed") {
				if (entry.coreMat) entry.coreMat.opacity = FOCUS_MESH_ALPHA.seed;
				if (entry.haloMat) entry.haloMat.opacity = FOCUS_HALO_ALPHA.seed;
				writeLabel(entry, FOCUS_ALPHA.seed);
				return;
			}

			// Frustum cull: skip the whole update for off-screen nodes.
			// They aren't visible, so a stale tier-dim or label opacity
			// is invisible until they come back into view — at which
			// point this pass fires again and catches them.
			entry.group.getWorldPosition(tmp);
			if (!scratch.frustum.containsPoint(tmp)) return;

			if (entry.coreMat) entry.coreMat.opacity = FOCUS_MESH_ALPHA[tier];
			if (entry.haloMat) entry.haloMat.opacity = FOCUS_HALO_ALPHA[tier];

			// Squared-distance fast-path: the trivial endpoints (well-
			// near = full alpha, well-far = zero) resolve without a
			// sqrt. Only the lerp interior pays the sqrt + the generic
			// `computeLabelOpacity` call.
			const dSq = camPos.distanceToSquared(tmp);
			const farForNode =
				LOD_DEFAULTS.dFar +
				LOD_DEFAULTS.hubBonus * Math.log1p(Math.max(0, entry.degree));
			const farForNodeSq = farForNode * farForNode;
			let opacity: number;
			if (dSq <= dNearSq) {
				opacity = FOCUS_ALPHA[tier];
			} else if (dSq >= farForNodeSq) {
				opacity = 0;
			} else {
				opacity = computeLabelOpacity({
					distance: Math.sqrt(dSq),
					degree: entry.degree,
					focusTier: tier,
				});
			}
			writeLabel(entry, opacity);
		});
		this.statSamples.lodMs = performance.now() - t0;
	}

	private deriveFocusSet(seeds: ReadonlySet<string>): Set<string> {
		const out = new Set<string>(seeds);
		for (const id of seeds) {
			const ns = this.adjacency.get(id);
			if (ns) for (const n of ns) out.add(n);
		}
		return out;
	}

	private setSurfacedInternal(seeds: ReadonlySet<string> | null): void {
		const next = seeds ? new Set(seeds) : new Set<string>();
		// Skip rebuild if the set is identical.
		if (setsEqual(this.surfaced, next)) return;
		this.surfaced = next;
		this.rebuildGraph();
	}

	// ====================================================================
	// Internal — frame loop + budget pass
	// ====================================================================

	/**
	 * Single camera-change pipeline. One subscription, one rAF, fixed
	 * phase order: budget recompute → label LOD. Both used to live in
	 * separate effects in React; folding them halves listener + frame
	 * work and pins their relative order so a budget-driven graphData
	 * change doesn't race with a visual reapply.
	 */
	private attachOrbitListener(): void {
		if (!this.fg) return;
		const ctrl = this.fg.controls() as OrbitControlsLike;
		if (!ctrl?.addEventListener) return;
		const tick = () => {
			this.framePending = false;
			this.recomputeExpansionFromCamera();
			this.applyVisuals();
			this.emit("cameraChange");
		};
		const onChange = () => {
			// Camera moved → wake the library, schedule the tick, and
			// (re-)arm the idle pause for after the user stops dragging.
			this.touchActivity();
			if (this.framePending) return;
			this.framePending = true;
			requestAnimationFrame(tick);
		};
		ctrl.addEventListener("change", onChange);
		this.orbitChangeHandler = onChange;
	}

	private detachOrbitListener(): void {
		if (!this.fg || !this.orbitChangeHandler) return;
		const ctrl = this.fg.controls() as OrbitControlsLike;
		ctrl?.removeEventListener?.("change", this.orbitChangeHandler);
		this.orbitChangeHandler = null;
	}

	private recomputeExpansionFromCamera(): void {
		const fg = this.fg;
		if (!fg) return;
		const t0 = performance.now();
		const cam = fg.camera() as THREE.PerspectiveCamera;
		const cameraSample = {
			x: cam.position.x,
			y: cam.position.y,
			z: cam.position.z,
		};
		// Bias the budget toward what the user can actually see. Without
		// this, equally-scored clusters tied for the last expansion slot
		// might pick one behind the camera — annoying when the user
		// zooms in on a specific area and the expansion budget gets
		// "spent" out of view.
		const inFrustum = clustersInFrustum(
			this.clusters,
			cam,
			this.frustumScratch,
		);
		const result = computeExpansion({
			clusters: this.clusters,
			looseNodeCount: this.clusterIndex.loose.length,
			camera: cameraSample,
			previous: this.expanded,
			lastChange: this.lastClusterChange,
			now: t0,
			pinnedOpen: this.pinned,
			inFrustum,
		});
		this.statSamples.budgetMs = performance.now() - t0;
		if (result.changed.size === 0) return;
		const t = performance.now();
		for (const id of result.changed) {
			this.lastClusterChange.set(id, t);
		}
		this.expanded = result.expanded;
		this.rebuildGraph();
	}

	// ====================================================================
	// Internal — buildNodeObject
	// ====================================================================

	private buildNodeObject(n: FgAnyNode): THREE.Group {
		// Defensive: if the library calls us for an id we've already
		// registered, detach the previous group + label first.
		const prior = this.sceneNodes.get(n.id);
		if (prior) {
			if (prior.group.parent) prior.group.parent.remove(prior.group);
			if (prior.labelEl.parentElement) prior.labelEl.remove();
		}

		if (isBubble(n)) {
			const { group, labelEl, labelObj, haloMat } = buildClusterBubble(n);
			this.sceneNodes.set(n.id, {
				group,
				labelEl,
				labelObj,
				coreMat: null,
				haloMat,
				degree: n._degree,
				lastOpacityBucket: -1,
				lastInteractive: null,
			});
			return group;
		}

		const node = n;
		const color = new THREE.Color(node.color);
		const group = new THREE.Group();

		// Core body
		const radius = Math.max(2.5, Math.sqrt(node.val) * 1.6);
		const coreGeo = new THREE.IcosahedronGeometry(radius, 1);
		const coreMat = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.95,
		});
		group.add(new THREE.Mesh(coreGeo, coreMat));

		// Invisible hit sphere — extends click target ~2× past the
		// visible icosahedron so the cursor doesn't have to land
		// pixel-perfect.
		const hitGeo = new THREE.SphereGeometry(radius * 2, 12, 8);
		const hitMat = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0,
			depthWrite: false,
		});
		group.add(new THREE.Mesh(hitGeo, hitMat));

		// Halo — additive sprite that scales with degree. Skipped on
		// leaf nodes since the halo would be smaller than the
		// icosahedron itself. Capped at 6× radius to bound fillrate
		// on hub nodes — the visual still reads as "this one glows
		// brighter," but a degree-100 hub doesn't try to fill an
		// entire screen-sized halo.
		const haloScale = Math.min(6, 3 + Math.log1p(node.degree) * 3);
		let haloMat: THREE.SpriteMaterial | null = null;
		if (haloScale > 4) {
			haloMat = new THREE.SpriteMaterial({
				map: getHaloTexture(),
				color,
				transparent: true,
				opacity: 0.45,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			});
			const halo = new THREE.Sprite(haloMat);
			halo.scale.set(haloScale * radius, haloScale * radius, 1);
			group.add(halo);
		}

		// HTML label
		const labelEl = document.createElement("div");
		labelEl.className = "galaxy-label";
		labelEl.dataset.nodeId = node.id;
		labelEl.innerHTML = `<span class="galaxy-label-icon" style="color:${node.color}">${getIconSvg(
			node.kind,
			node.subtype,
		)}</span><span>${escapeHtml(node.label)}</span>`;
		const labelObj = new CSS2DObject(labelEl);
		labelObj.position.set(0, radius + 4, 0);
		group.add(labelObj);

		this.sceneNodes.set(node.id, {
			group,
			labelEl,
			labelObj,
			coreMat,
			haloMat,
			degree: node.degree,
			lastOpacityBucket: -1,
			lastInteractive: null,
		});

		return group;
	}

	// ====================================================================
	// Internal — listeners
	// ====================================================================

	private tuneControls(): void {
		const fg = this.fg;
		if (!fg) return;
		const ctrl = fg.controls() as OrbitControlsLike;
		if (ctrl) {
			ctrl.zoomSpeed = 1.6;
			ctrl.rotateSpeed = 0.7;
			ctrl.panSpeed = 0.9;
			ctrl.enableDamping = true;
			ctrl.dampingFactor = 0.12;
			if (ctrl.mouseButtons) {
				ctrl.mouseButtons.LEFT = THREE.MOUSE.PAN;
				ctrl.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
				ctrl.mouseButtons.RIGHT = -1;
			}
			ctrl.zoomToCursor = true;
		}
		fg.zoomToFit(800, 80);
	}

	private refitOnData(): void {
		const fg = this.fg;
		if (!fg) return;
		// Defer one tick — controls instance might still be mounting.
		setTimeout(() => fg.zoomToFit(800, 80), 60);
	}

	private attachContainerListeners(): void {
		const container = this.container;
		if (!container) return;

		const closestLabel = (e: Event): HTMLElement | null => {
			const target = e.target as HTMLElement | null;
			return target?.closest(".galaxy-label") as HTMLElement | null;
		};
		const findNode = (id: string | undefined): FgAnyNode | null => {
			if (!id) return null;
			return (this.nodeSet.findById(id) as FgAnyNode) ?? null;
		};

		const onClick = (e: MouseEvent) => {
			const label = closestLabel(e);
			if (!label?.dataset.nodeId) return;
			const node = findNode(label.dataset.nodeId);
			if (!node) return;
			e.stopPropagation();
			this.handleClick(node);
		};
		const onOver = (e: MouseEvent) => {
			const label = closestLabel(e);
			if (!label?.dataset.nodeId) return;
			const node = findNode(label.dataset.nodeId);
			if (!node || isBubble(node)) return;
			this.emit("hover", node);
		};
		const onOut = (e: MouseEvent) => {
			const label = closestLabel(e);
			if (!label) return;
			// Moving label-to-label — let the new label's `over` swap.
			const related = (e.relatedTarget as HTMLElement | null)?.closest(
				".galaxy-label",
			);
			if (related) return;
			this.emit("hover", null);
		};
		const onMouseLeave = () => this.emit("hover", null);
		// Wake the library on any cursor motion so the next frame's
		// raycaster can resolve hovers and visuals can update. Cheap:
		// `touchActivity` short-circuits when not paused.
		const onMouseMove = () => this.touchActivity();

		container.addEventListener("click", onClick);
		container.addEventListener("mouseover", onOver);
		container.addEventListener("mouseout", onOut);
		container.addEventListener("mouseleave", onMouseLeave);
		container.addEventListener("mousemove", onMouseMove);
		this.containerClickHandler = onClick;
		this.containerOverHandler = onOver;
		this.containerOutHandler = onOut;
		this.mouseLeaveHandler = onMouseLeave;
		this.mouseMoveHandler = onMouseMove;
	}

	private handleRaycasterHover(n: FgAnyNode | null): void {
		// Bubbles get a separate hover affordance (cursor + halo) but
		// don't drive the per-node hover card — there's no entity to
		// describe.
		if (!n || isBubble(n)) {
			this.emit("hover", null);
			return;
		}
		this.emit("hover", n);
	}

	private handleClick(n: FgAnyNode): void {
		if (isBubble(n)) {
			this.togglePin(n._clusterId);
			return;
		}
		this.emit("click", n);
	}

	private attachKeyboardListener(): void {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (
				t?.tagName === "INPUT" ||
				t?.tagName === "TEXTAREA" ||
				t?.isContentEditable
			) {
				return;
			}
			const fg = this.fg;
			if (!fg) return;
			const cam = fg.camera() as THREE.PerspectiveCamera;
			const ctrl = fg.controls() as OrbitControlsLike;
			if (!ctrl?.target || !ctrl.update) return;
			const target = ctrl.target;
			const dist = cam.position.distanceTo(target);
			const panStep = dist * 0.06;
			const rotStep = 0.07;
			const isArrow =
				e.key === "ArrowUp" ||
				e.key === "ArrowDown" ||
				e.key === "ArrowLeft" ||
				e.key === "ArrowRight";
			if (!isArrow) return;

			if (e.shiftKey) {
				const offset = new THREE.Vector3().subVectors(cam.position, target);
				if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
					offset.applyAxisAngle(
						new THREE.Vector3(0, 1, 0),
						(e.key === "ArrowLeft" ? -1 : 1) * rotStep,
					);
				} else {
					const right = new THREE.Vector3()
						.crossVectors(cam.up, offset)
						.normalize();
					offset.applyAxisAngle(
						right,
						(e.key === "ArrowUp" ? -1 : 1) * rotStep,
					);
				}
				cam.position.copy(target).add(offset);
			} else {
				const view = new THREE.Vector3().subVectors(cam.position, target);
				const right = new THREE.Vector3()
					.crossVectors(cam.up, view)
					.normalize();
				const upScreen = new THREE.Vector3()
					.crossVectors(view, right)
					.normalize();
				const move = new THREE.Vector3();
				if (e.key === "ArrowUp") move.addScaledVector(upScreen, panStep);
				if (e.key === "ArrowDown") move.addScaledVector(upScreen, -panStep);
				if (e.key === "ArrowLeft") move.addScaledVector(right, -panStep);
				if (e.key === "ArrowRight") move.addScaledVector(right, panStep);
				cam.position.add(move);
				target.add(move);
			}
			e.preventDefault();
			ctrl.update?.();
		};
		window.addEventListener("keydown", onKey);
		this.keydownHandler = onKey;
	}
}

// ============================================================================
// Tiny utilities
// ============================================================================

function setsEqual<T>(
	a: ReadonlySet<T> | null | undefined,
	b: ReadonlySet<T> | null | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b) return !a === !b && (a?.size ?? 0) === (b?.size ?? 0);
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}
