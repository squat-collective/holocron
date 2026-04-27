# 3D galaxy map

> "Google Maps for your data." Every entity is a star, every relationship is an edge, and the camera does the rest.

The map lives at <http://localhost:3333/?mode=map> (or click the **mode toggle** on the home shell). The legacy `/map` route 301s into the home shell.

## What it shows

- **Nodes** — every asset, actor, and rule, coloured by entity type (datasets, reports, processes, systems, people, groups, rules).
- **Edges** — every relationship, coloured by type (`owns`, `uses`, `feeds`, `contains`, `member_of`, `applies_to`).
- **Animated particles** flow along edges in the direction of the relationship — you can read lineage at a glance.
- **Size** scales with degree (popular nodes look bigger).

The graph is laid out **once at API startup** with NetworkX `spring_layout` and cached in memory. Coordinates are stable across reads; the UI gets pre-computed `(x, y, z)` per node.

## Levels of detail

`GET /api/v1/graph/map?lod={0|1}`:

- **`lod=0`** — overview: only systems and teams. The "tectonic" view.
- **`lod=1`** — full graph: + datasets, reports, processes, people, rules.

The UI defaults to `lod=1` and lets you toggle.

## Interactions

| Action | Result |
|---|---|
| Click a node | Focus — camera glides; rest of the galaxy dims. |
| **Shift + Enter** | Lock the focused node; navigate to others while keeping it pinned. Multiple locks supported. |
| Arrow keys / vim keys (`hjkl`) | Layout-agnostic neighbour navigation — picks the next node in the screen-direction you indicated. |
| Mouse drag | Orbit. |
| Mouse wheel | Zoom. |
| Pinch | Trackpad zoom. |
| `?` | Open keyboard help. |
| `Esc` | Clear focus and locks. |

## Search ↔ map

- The home shell has both modes; switching to map keeps the current search query.
- Filtering search down to a kind (`ds:`, `r:`) also filters what's visible in the map.
- Selecting a search hit centres the camera on that node.

## Implementation pointers

| Concern | Where |
|---|---|
| Map data fetch | `packages/ui/src/hooks/use-graph-map.ts` |
| 3D rendering | `packages/ui/src/components/features/galaxy-map/galaxy-map.tsx` (react-force-graph-3d + three.js CSS2D) |
| Galaxy nebula background | `packages/ui/src/components/layout/galaxy-background.tsx` (canvas spirals + parallax) |
| Layout computation (server) | `packages/api/src/holocron/core/services/graph_service.py` |
| Layout endpoint | `packages/api/src/holocron/api/routes/graph.py` |

## Limitations

- Layout is computed once at startup. Adding many entities later doesn't re-layout — they get positioned but the global topology drifts. Restart the API to re-layout.
- At very large scale (>50k nodes) the 3D renderer slows. The product target is "tens of thousands of nodes"; beyond that, plan to filter or sample before rendering.
- The map is a single-tenant view. There's no per-user filter or workspace concept.
