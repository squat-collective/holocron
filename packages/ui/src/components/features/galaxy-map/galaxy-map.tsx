"use client";

import type { GraphEdge, GraphNode } from "@squat-collective/holocron-ts";
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
import { renderToStaticMarkup } from "react-dom/server";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import {
	CSS2DObject,
	CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import type { CatalogHit } from "@/hooks/use-catalog-search";
import { useGraphMap } from "@/hooks/use-graph-map";
import {
	getActorTypeIcon,
	getAssetTypeIcon,
	type LucideIcon,
	RuleIcon,
} from "@/lib/icons";

/**
 * GalaxyMap — the 3D "Google Maps for data" view.
 *
 * WebGL scene via react-force-graph-3d (three.js). Every node carries
 * its `(x, y, z)` from the server, so the force simulation stays frozen
 * and layout is deterministic across sessions / shareable by URL.
 *
 * Passive discovery is built into the visual language:
 *   - Hue encodes entity kind (dataset / report / system / person / team / rule)
 *   - Size + glow encodes degree (data hubs literally shine brighter)
 *   - Tier-0 nodes (systems + teams) sit on the galactic plane; tier-1
 *     nodes float in a thin shell around it.
 *
 * Active navigation is through the floating search bar:
 *   - Type a query → matching nodes go bright, non-matches dim
 *   - Enter → camera flies to the best match
 */

// Pulled from the app's CSS custom properties so the 3D palette matches
// the chips and lineage edges everywhere else.
//
// The app's tokens live in `oklch()` (Tailwind v4 default). Two layers
// have to convert before THREE.Color sees something it understands:
//   1. CSS engine resolves the var → some color string (might be
//      `rgb(...)`, `rgba(...)`, or even `color(srgb ...)` in wide-gamut
//      browsers — THREE chokes on the last form).
//   2. We paint that string into a 1×1 canvas and read the pixel back.
//      Whatever the browser supports for canvas paint, the pixel data is
//      always 8-bit sRGB — so we hand THREE a normalized `rgb(r, g, b)`.
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

interface Palette {
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

function usePalette(): Palette {
	// Resolved synchronously on first client render. The component is
	// dynamic-imported with `ssr: false` so `window` is always defined
	// here — but we still pass safe fallbacks just in case the probe
	// trick fails on a node before document.body is settled.
	//
	// The library memoizes node 3D objects by `id`, so if the palette
	// updates *after* first render the existing meshes keep their stale
	// (fallback) color. Resolving in useState's initializer means the
	// first render already has the right colors and we never have to
	// rebuild the scene.
	const [palette] = useState<Palette>(() => ({
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
	}));
	return palette;
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

/**
 * Convert a `rgb(r, g, b)` string to `rgba(r, g, b, a)` so we can keep
 * the resolved CSS palette while modulating opacity per render state
 * (hovered / matched / dimmed). Falls through unmodified for any input
 * that isn't the canonical 3-channel form.
 */
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

/**
 * Lucide icon → SVG string. Rendered once per (kind, subtype) at first
 * use and cached, so subsequent labels are a Map lookup.
 */
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


function hrefFor(node: GraphNode): string {
	switch (node.kind) {
		case "asset":
			return `/assets/${node.id}`;
		case "actor":
			return `/actors/${node.id}`;
		case "rule":
			return `/rules/${node.id}`;
	}
}

/**
 * Map a search hit back to the graph node we should focus on. Schema
 * hits (containers / fields) don't have their own galaxy presence —
 * they collapse onto their parent asset.
 */
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
 * Shape we hand to react-force-graph-3d. Extends the API `GraphNode`
 * with the `fx/fy/fz` fixed-position properties + the mutable visual
 * attributes the renderer tracks (color, visibility scalars).
 */
interface FgNode extends GraphNode {
	fx: number;
	fy: number;
	fz: number;
	val: number;
	color: string;
	_dimmed?: boolean;
}
interface FgLink {
	source: string;
	target: string;
	type: string;
	color?: string;
}

/**
 * Untyped façade over the react-force-graph-3d ref. The library doesn't
 * export TypeScript declarations for its imperative API, so we describe
 * just the methods we actually call.
 */
interface FgHandle {
	cameraPosition: (
		p: { x: number; y: number; z: number },
		look?: { x: number; y: number; z: number },
		ms?: number,
	) => void;
	zoomToFit: (
		ms?: number,
		padding?: number,
		nodeFilter?: (n: { id: string }) => boolean,
	) => void;
	camera: () => THREE.Camera;
	controls: () => {
		zoomSpeed?: number;
		rotateSpeed?: number;
		panSpeed?: number;
		enableDamping?: boolean;
		dampingFactor?: number;
		target?: THREE.Vector3;
		update?: () => void;
		mouseButtons?: { LEFT?: number; MIDDLE?: number; RIGHT?: number };
		zoomToCursor?: boolean;
	};
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
	const { data, isLoading } = useGraphMap(1);
	const palette = usePalette();
	const fgRef = useRef<FgHandle | null>(null);

	// Hovered node — drives a custom React tooltip instead of the
	// library's built-in HTML one, which appears at a fixed offset from
	// the node and feels detached from the cursor.
	//
	// The cursor position is intentionally NOT React state — `HoverCard`
	// listens to mousemove on `containerRef` directly and writes the
	// position to its own DOM via a ref. Lifting cursor state onto this
	// component re-rendered the whole `<ForceGraph3D>` tree (and re-ran
	// every link callback) on every pixel of mouse motion — the biggest
	// single cause of the lag in #25.
	const [hoveredNode, setHoveredNode] = useState<FgNode | null>(null);

	// Keyboard-driven focus — arrow-selected hit drives the same edge
	// glow + camera fly the mouse hover does. Mouse hover wins so the
	// cursor always feels in control when it's actually moving.
	const [keyboardFocusNode, setKeyboardFocusNode] = useState<FgNode | null>(null);

	// Locked nodes — pinned focus seeds. Hover + keyboard focus still
	// add transient seeds on top, so the focus set is always the union
	// `{locked ∪ hovered ∪ keyboardFocus}` plus their 1-hop neighbours.
	// Press Enter while a node is hovered (or while a search hit is
	// keyboard-selected) to toggle its lock.
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

	// CSS2DRenderer mounts a separate DOM layer over the WebGL canvas so
	// every label is a real <div>. Keep it in a ref + a stable
	// extraRenderers array so ForceGraph3D doesn't re-init the scene on
	// every render.
	const css2dRendererRef = useRef<CSS2DRenderer | null>(null);
	const extraRenderers = useMemo(() => {
		if (typeof window === "undefined") return [];
		const r = new CSS2DRenderer();
		r.domElement.style.position = "absolute";
		r.domElement.style.top = "0";
		r.domElement.style.left = "0";
		r.domElement.style.width = "100%";
		r.domElement.style.height = "100%";
		r.domElement.style.pointerEvents = "none";
		css2dRendererRef.current = r;
		return [r];
		// Intentionally empty deps — the renderer must be a singleton.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Per-node visual registry — populated at mesh build time. The
	// search-dim + focus-collapse effects mutate the registered group
	// `visible` flag + material opacities + label classes instead of
	// rebuilding the whole node object — that's how we keep
	// `buildNodeObject` deps empty and avoid duplicate labels.
	const labelRegistryRef = useRef<
		Map<
			string,
			{
				obj: CSS2DObject;
				group: THREE.Group;
				coreMat: THREE.MeshBasicMaterial;
				haloMat: THREE.SpriteMaterial | null;
			}
		>
	>(new Map());
	useEffect(() => {
		labelRegistryRef.current = new Map();
	}, [data]);

	// Adjacency index — used both for focus-mode label collapse and for
	// the "best view" camera framing (zoom to {focused} ∪ neighbours).
	const adjacency = useMemo(() => {
		const m = new Map<string, Set<string>>();
		if (!data) return m;
		for (const e of data.edges) {
			if (!m.has(e.source)) m.set(e.source, new Set());
			if (!m.has(e.target)) m.set(e.target, new Set());
			m.get(e.source)?.add(e.target);
			m.get(e.target)?.add(e.source);
		}
		return m;
	}, [data]);

	// Focus set — every "seed" node (locked + hovered + keyboard-
	// selected) plus its 1-hop neighbours. Drives both the soft-dim of
	// off-cluster nodes/edges and the camera framing.
	const focusSet = useMemo<Set<string> | null>(() => {
		const seeds = new Set<string>(lockedIds);
		if (hoveredNode) seeds.add(hoveredNode.id);
		if (keyboardFocusNode) seeds.add(keyboardFocusNode.id);
		if (seeds.size === 0) return null;
		const out = new Set<string>(seeds);
		for (const id of seeds) {
			const ns = adjacency.get(id);
			if (ns) for (const n of ns) out.add(n);
		}
		return out;
	}, [lockedIds, hoveredNode, keyboardFocusNode, adjacency]);

	// Focus visual: in-focus nodes stay full bright; non-focus nodes
	// soften (mesh + halo + label) but stay clearly visible so the
	// surrounding galaxy keeps its spatial context. Edges follow the
	// same rule via the `linkColor` callback below.
	useEffect(() => {
		labelRegistryRef.current.forEach(({ obj, coreMat, haloMat }, id) => {
			const inFocus = !focusSet || focusSet.has(id);
			coreMat.opacity = inFocus ? 0.95 : 0.5;
			if (haloMat) haloMat.opacity = inFocus ? 0.45 : 0.18;
			(obj.element as HTMLElement).classList.toggle(
				"galaxy-label-dim",
				!inFocus,
			);
		});
	}, [focusSet, data]);


	const graphData = useMemo(() => {
		if (!data) return { nodes: [] as FgNode[], links: [] as FgLink[] };
		const nodes: FgNode[] = data.nodes.map((n) => ({
			...n,
			fx: n.x,
			fy: n.y,
			fz: n.z,
			val: n.size,
			color: colorFor(n, palette),
		}));
		const links: FgLink[] = data.edges.map((e: GraphEdge) => ({
			source: e.source,
			target: e.target,
			type: e.type,
		}));
		return { nodes, links };
	}, [data, palette]);

	// Custom node object — an icosahedron with additive emissive, plus a
	// soft sprite halo whose size tracks `degree`. Big hubs literally glow.
	//
	// Stable across renders: `useCallback` deps are empty so the library
	// only invokes this once per node id. Live state (search dim, focus
	// emphasis) is applied later by mutating the registered materials —
	// rebuilding here is what previously left ghost labels behind.
	const buildNodeObject = useCallback((n: unknown) => {
		const node = n as FgNode;
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

		// Halo — additive sprite that scales with degree. Invisible on leafs.
		const haloScale = 3 + Math.log1p(node.degree) * 4;
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

		// HTML label — always visible. Search dim is applied via a CSS
		// class toggle on this element later, no rebuild required.
		const labelEl = document.createElement("div");
		labelEl.className = "galaxy-label";
		labelEl.innerHTML = `<span class="galaxy-label-icon" style="color:${node.color}">${getIconSvg(
			node.kind,
			node.subtype,
		)}</span><span>${escapeHtml(node.label)}</span>`;
		const labelObj = new CSS2DObject(labelEl);
		labelObj.position.set(0, radius + 4, 0);
		group.add(labelObj);
		labelRegistryRef.current.set(node.id, {
			obj: labelObj,
			group,
			coreMat,
			haloMat,
		});

		return group;
	}, []);

	// Camera fly: place the camera so the seed-cluster (seeds + 1-hop
	// neighbours) fills the viewport with a tight margin. We compute
	// this directly from cluster centroid + bounding radius rather than
	// using `zoomToFit`'s pixel-padding model — the latter is too soft
	// on small clusters (single hit + two neighbours) and leaves the
	// result feeling far away.
	const flyToSeeds = useCallback(
		(seedIds: Iterable<string>, fitFactor = 1.6) => {
			const fg = fgRef.current;
			if (!fg) return;
			const ids = new Set<string>();
			for (const id of seedIds) {
				ids.add(id);
				const ns = adjacency.get(id);
				if (ns) for (const n of ns) ids.add(n);
			}
			if (ids.size === 0) return;

			// Centroid + bounding radius of the cluster.
			let cx = 0;
			let cy = 0;
			let cz = 0;
			let count = 0;
			for (const n of graphData.nodes) {
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
			let radius = 60; // floor — keeps a single isolated hit from snapping in too close
			for (const n of graphData.nodes) {
				if (!ids.has(n.id)) continue;
				const r = Math.hypot(n.x - cx, n.y - cy, n.z - cz);
				if (r > radius) radius = r;
			}

			// Distance so the cluster's bounding sphere fits the FOV.
			// `fitFactor` adds breathing room — 1.6 is "snug, not cramped".
			const cam = fg.camera() as THREE.PerspectiveCamera;
			const fovRad = (cam.fov * Math.PI) / 180;
			const distance = (radius * fitFactor) / Math.sin(fovRad / 2);

			// Preserve the user's current viewing angle: keep the same
			// camera-from-target direction, just translate to the new
			// centroid and back off by `distance`.
			const ctrl = fg.controls();
			const dir = ctrl?.target
				? new THREE.Vector3()
						.subVectors(cam.position, ctrl.target)
						.normalize()
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
		},
		[adjacency, graphData.nodes],
	);


	// Recenter — zoom out to fit the whole map.
	const recenter = useCallback(() => {
		fgRef.current?.zoomToFit(700, 80);
	}, []);

	// On data load: pull camera to a 3/4-perspective home shot, fit
	// everything, then tune the OrbitControls so panning/zooming feel
	// like Google Earth instead of a free trackball.
	useEffect(() => {
		if (!data || data.nodes.length === 0) return;
		const fg = fgRef.current;
		if (!fg) return;
		// Defer one tick — the library mounts the controls instance
		// asynchronously and zoomToFit is a no-op before that.
		const t = setTimeout(() => {
			const ctrl = fg.controls();
			if (ctrl) {
				ctrl.zoomSpeed = 1.6;
				ctrl.rotateSpeed = 0.7;
				ctrl.panSpeed = 0.9;
				ctrl.enableDamping = true;
				ctrl.dampingFactor = 0.12;
				// Google-Maps-style mouse mapping: left-drag pans, middle
				// rotates, right-click does nothing. Pan as the primary
				// gesture matches what people expect from a map UI.
				if (ctrl.mouseButtons) {
					ctrl.mouseButtons.LEFT = THREE.MOUSE.PAN;
					ctrl.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
					ctrl.mouseButtons.RIGHT = -1;
				}
				// Scroll dollies toward the cursor instead of toward the
				// orbit target — same feel as Google Maps' wheel zoom.
				ctrl.zoomToCursor = true;
			}
			fg.zoomToFit(800, 80);
		}, 60);
		return () => clearTimeout(t);
	}, [data]);

	// Keyboard camera navigation — arrow keys (universal across keyboard
	// layouts). Plain arrows pan, Shift+arrows rotate around the orbit
	// target. Step sizes scale with current zoom so pans feel consistent
	// at any altitude. Skipped while an input has focus so search
	// typing / Shift+Enter / row arrow-nav are never hijacked.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (
				t?.tagName === "INPUT" ||
				t?.tagName === "TEXTAREA" ||
				t?.isContentEditable
			)
				return;
			const fg = fgRef.current;
			if (!fg) return;
			const cam = fg.camera() as THREE.PerspectiveCamera;
			const ctrl = fg.controls();
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
				// Rotate. ←/→ orbit around world-up; ↑/↓ tilt around the
				// camera-right axis (clamped via three's natural OrbitControls
				// damping).
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
				// Pan in screen-space directions.
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
			ctrl.update();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Resize the CSS2DRenderer to match the canvas — without this the
	// label DOM layer drifts on first render / window resize.
	useEffect(() => {
		const r = css2dRendererRef.current;
		const el = containerRef.current;
		if (!r || !el) return;
		const sync = () => {
			const rect = el.getBoundingClientRect();
			r.setSize(rect.width, rect.height);
		};
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);


	// Active hit (parent-driven) → on-map focus + camera fly. Schema
	// hits (containers / fields) collapse onto their parent asset.
	useEffect(() => {
		if (!activeHit) {
			setKeyboardFocusNode(null);
			return;
		}
		const id = nodeIdForHit(activeHit);
		const node = graphData.nodes.find((n) => n.id === id);
		if (!node) return;
		setKeyboardFocusNode(node);
		flyToSeeds([id], 1.4);
	}, [activeHit, graphData.nodes, flyToSeeds]);

	// Imperative API the parent uses to drive locks + recenters from the
	// shared search bar (Shift+Enter forwards here when in map mode).
	useImperativeHandle(
		ref,
		() => ({
			toggleLockHit: (hit: CatalogHit) => {
				const id = nodeIdForHit(hit);
				toggleLock(id);
			},
			recenter: () => {
				fgRef.current?.zoomToFit(700, 80);
			},
		}),
		[toggleLock],
	);

	// Document-level Shift+Enter while a map node is hovered — toggles
	// its lock. Works regardless of which element has focus so the user
	// can be typing in the search input and still pin a hovered node.
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

	// Memoize every per-link callback that <ForceGraph3D> reads — the
	// library re-evaluates them for every link on every render, so a
	// fresh closure per render = O(N) JS work per render even when the
	// link styling didn't change. Deps cover the only inputs each one
	// actually depends on; everything else is captured stably.
	const linkColor = useCallback(
		(l: unknown) => {
			const link = l as {
				source: string | { id: string };
				target: string | { id: string };
				type: string;
			};
			const src =
				typeof link.source === "string" ? link.source : link.source.id;
			const tgt =
				typeof link.target === "string" ? link.target : link.target.id;
			const base = relationColor(link.type, palette);
			if (!focusSet) return withAlpha(base, 0.45);
			if (focusSet.has(src) && focusSet.has(tgt)) return withAlpha(base, 0.95);
			return withAlpha(base, 0.22);
		},
		[focusSet, palette],
	);

	const linkWidth = useCallback(
		(l: unknown) => {
			if (!focusSet) return 0.7;
			const link = l as {
				source: string | { id: string };
				target: string | { id: string };
			};
			const src =
				typeof link.source === "string" ? link.source : link.source.id;
			const tgt =
				typeof link.target === "string" ? link.target : link.target.id;
			return focusSet.has(src) && focusSet.has(tgt) ? 1.6 : 0.5;
		},
		[focusSet],
	);

	// Default particle count: 1 (was 2). Two animated particles per
	// edge with no focus active was a constant frame-budget tax even
	// on tiny graphs — cutting it in half keeps the "alive" feel of
	// the unfocused map while halving the per-frame particle work.
	const linkDirectionalParticles = useCallback(
		(l: unknown) => {
			if (!focusSet) return 1;
			const link = l as {
				source: string | { id: string };
				target: string | { id: string };
			};
			const src =
				typeof link.source === "string" ? link.source : link.source.id;
			const tgt =
				typeof link.target === "string" ? link.target : link.target.id;
			return focusSet.has(src) && focusSet.has(tgt) ? 8 : 1;
		},
		[focusSet],
	);

	const linkDirectionalParticleWidth = useCallback(
		(l: unknown) => {
			if (!focusSet) return 2.4;
			const link = l as {
				source: string | { id: string };
				target: string | { id: string };
			};
			const src =
				typeof link.source === "string" ? link.source : link.source.id;
			const tgt =
				typeof link.target === "string" ? link.target : link.target.id;
			return focusSet.has(src) && focusSet.has(tgt) ? 5 : 1.6;
		},
		[focusSet],
	);

	const linkDirectionalParticleColor = useCallback(
		(l: unknown) => {
			const link = l as { type: string };
			return relationColor(link.type, palette);
		},
		[palette],
	);

	// `nodeLabel="" ` would also work but the library types insist on a
	// fn. Stable identity here means no internal re-evaluation.
	const emptyNodeLabel = useCallback(() => "", []);

	const handleNodeHover = useCallback(
		(n: unknown) => setHoveredNode((n as FgNode | null) ?? null),
		[],
	);

	const handleNodeClick = useCallback(
		(n: unknown) => {
			const node = n as FgNode;
			router.push(hrefFor(node));
		},
		[router],
	);

	if (isLoading) {
		return (
			<div className="relative w-full h-full flex items-center justify-center">
				<GalaxySpinner size={220} label="Charting the galaxy…" />
			</div>
		);
	}

	return (
			<div
				ref={containerRef}
				className="relative isolate w-full h-full overflow-hidden rounded-xl bg-[#050613]"
				onMouseLeave={() => {
					setHoveredNode(null);
				}}
			>
				<ForceGraph3D
				ref={
					fgRef as unknown as React.MutableRefObject<
						/* biome-ignore lint/suspicious/noExplicitAny: library ref is untyped */
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						any
					>
				}
				graphData={graphData}
				backgroundColor="#050613"
				cooldownTicks={0}
				warmupTicks={0}
				// Orbit feels like Google Earth: fixed up-axis, predictable
				// rotation. Trackball (the library default) makes every drag
				// rotate the world's "up", which is what made navigation feel
				// disorienting — you'd lose track of which way is forward.
				controlType="orbit"
				// CSS2DRenderer overlays an HTML layer on top of the WebGL
				// canvas — every node and edge label is a real <div>. The
				// library types `extraRenderers` as `WebGLRenderer[]` but
				// the runtime contract is broader (anything with a `render()`
				// method works), per the official react-force-graph examples.
				extraRenderers={
					extraRenderers as unknown as React.ComponentProps<
						typeof ForceGraph3D
					>["extraRenderers"]
				}
				// Node visuals are fully custom; built-ins are disabled via
				// nodeThreeObject + nodeThreeObjectExtend=false.
				nodeThreeObject={buildNodeObject}
				nodeThreeObjectExtend={false}
				// Built-in HTML tooltip disabled — we render our own overlay
				// that follows the cursor (see <HoverCard /> below).
				nodeLabel={emptyNodeLabel}
				linkColor={linkColor}
				linkWidth={linkWidth}
				// Don't multiply alpha at the renderer level — the per-link
				// opacity is already baked into linkColor.
				linkOpacity={1}
				// Animated direction: small particles flow along every
				// edge from source → target, painted in the relation
				// colour. Count + size scale up on focused edges so the
				// active cluster reads as a stream of bright dashes
				// while the surrounding galaxy keeps a subtler pulse.
				linkDirectionalParticles={linkDirectionalParticles}
				linkDirectionalParticleSpeed={0.006}
				linkDirectionalParticleWidth={linkDirectionalParticleWidth}
				linkDirectionalParticleResolution={6}
				linkDirectionalParticleColor={linkDirectionalParticleColor}
				onNodeHover={handleNodeHover}
				onNodeClick={handleNodeClick}
				enableNodeDrag={false}
				enableNavigationControls={true}
			/>

				{/* Ambient nebulae — same drifting milky-way look as the
				    page background, scoped to the map. `screen` blend mode
				    adds the nebula colour to the dark canvas underneath
				    without dimming the nodes; `pointer-events-none` lets
				    drags pass through to OrbitControls. */}
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
				{(hoveredNode ||
					keyboardFocusNode ||
					lockedIds.size > 0) && (
					<div className="pointer-events-auto absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-xs">
						{(() => {
							const active = hoveredNode ?? keyboardFocusNode;
							if (!active) return null;
							return (
								<NodeInfoPanel
									node={active}
									onOpen={() => router.push(hrefFor(active))}
								/>
							);
						})()}
						{lockedIds.size > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{[...lockedIds].map((id) => {
									const node = graphData.nodes.find((n) => n.id === id);
									if (!node) return null;
									return (
										<button
											key={id}
											type="button"
											onClick={() => unlock(id)}
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
									);
								})}
								{lockedIds.size > 1 && (
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

				{/* Recenter button — top right of the map pane. */}
				<button
					type="button"
					onClick={recenter}
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
 * connection count) are filled from the graph-map payload synchronously;
 * description + kind-specific fields stream in once the entity-detail
 * fetch resolves. Cached + dedup'd so skimming results stays cheap.
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
			{/* Heading: icon + name */}
			<div className="flex items-center gap-2 min-w-0">
				<Icon className="size-4 shrink-0" style={{ color: node.color }} />
				<span className="font-medium text-sm truncate">{node.label}</span>
			</div>
			{/* Meta line: kind · subtype · connections [· status] */}
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
			{/* Description */}
			{detail?.description && (
				<p className="text-xs text-muted-foreground/90 line-clamp-3 leading-snug">
					{detail.description}
				</p>
			)}
			{/* Location (assets) */}
			{isAsset && detail?.location && (
				<div className="text-[10px] font-mono text-muted-foreground/80 truncate">
					{detail.location}
				</div>
			)}
			{/* Email (persons) */}
			{isPerson && detail?.email && (
				<a
					href={`mailto:${detail.email}`}
					className="block text-xs text-primary hover:underline truncate"
					onClick={(e) => e.stopPropagation()}
				>
					{detail.email}
				</a>
			)}
			{/* Footer: view-details link */}
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
 * tree (including every memoized link callback) for each pixel of
 * mouse motion, which was the single biggest cause of the lag in
 * #25. With a ref-driven update only this tiny wrapper changes per
 * frame, leaving `<ForceGraph3D>` untouched.
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
				// Hidden until the first mousemove writes the position; otherwise
				// the card flashes at (0,0) on hover-enter for one frame.
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

/**
 * Radial-gradient halo sprite, built once and reused. Without this every
 * hub would allocate its own texture and the map would tank.
 */
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
			{/* Node kinds — coloured dots, mirrors how each entity renders. */}
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
			{/* Relations — short lines instead of dots so the marker reads
			    as an edge, not a node. */}
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
