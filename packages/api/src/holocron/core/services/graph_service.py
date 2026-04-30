"""Build and cache the data-landscape map.

One Cypher query pulls every first-class node (asset/actor/rule) and
every relation between them. We then run a deterministic spring layout
once, assign `(x, y)` to each node, and cache the whole payload in
memory. The cache is invalidated by a simple version counter bumped on
any write — cheap for a spike; at production scale we'd swap this for
a scheduled layout job that writes coordinates back to Neo4j.

The response separates nodes by `lod` tier so the client can render
"max zoom out = architecture view" (tier 0) and progressively load
more detail as the user zooms in.
"""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass
from typing import Any

import networkx as nx

from holocron.api.schemas.graph import (
    GraphCluster,
    GraphClusterKind,
    GraphEdge,
    GraphMapResponse,
    GraphNode,
    GraphNodeKind,
    LodTier,
)
from holocron.db.connection import Neo4jDriver

logger = logging.getLogger(__name__)

# Relation types that contribute edges to the data-landscape map. Kept as a
# module-level constant so adding a new type doesn't require eyeballing a
# string-embedded Cypher list. Order is irrelevant; the cypher renders
# whatever's here as a static IN clause.
_MAP_EDGE_TYPES: tuple[str, ...] = (
    "OWNS",
    "USES",
    "FEEDS",
    "CONTAINS",
    "MEMBER_OF",
    "APPLIES_TO",
)

# Deterministic seed so the layout is stable across requests/restarts —
# tiles + client-side caching only work if positions don't drift.
_LAYOUT_SEED = 42
# Spring constant. Picked by eye on the Star Wars fixture; too small and
# clusters overlap, too large and everything flies apart.
_LAYOUT_K = 1.5
# Coordinate scale — keeps values in a render-friendly range for Sigma.
_LAYOUT_SCALE = 1000.0


def _kind_of(label: str) -> GraphNodeKind | None:
    """Map a Neo4j label to our 3 first-class kinds. Anything else
    (Container, Field, Event) is out of scope for the overview map."""
    if label == "Asset":
        return "asset"
    if label == "Actor":
        return "actor"
    if label == "Rule":
        return "rule"
    return None


def _lod_for(kind: GraphNodeKind, subtype: str) -> LodTier:
    """Decide at which zoom level a given entity first appears.

    Tier 0 = "architecture view": only the biggest containers of data
    (systems) and the org shape (teams). Everything else is tier 1.
    """
    if kind == "asset" and subtype == "system":
        return LodTier.OVERVIEW
    if kind == "actor" and subtype == "group":
        return LodTier.OVERVIEW
    return LodTier.ENTITIES


@dataclass(frozen=True)
class _RawNode:
    uid: str
    label: str  # Neo4j label
    name: str
    subtype: str  # asset.type / actor.type / rule.severity


@dataclass(frozen=True)
class _RawEdge:
    uid: str
    source: str
    target: str
    type: str


class GraphService:
    """Builds the map once, serves it many times.

    `get_map(lod)` returns a cached payload filtered to the requested
    tier ceiling. The first call is O(N log N) (query + layout); every
    subsequent call is a dict lookup until the cache is invalidated.
    """

    def __init__(self, driver: Neo4jDriver) -> None:
        self._driver = driver
        self._cache: GraphMapResponse | None = None
        self._lock = asyncio.Lock()

    def invalidate(self) -> None:
        """Drop the cached layout. Wired up via ``EventService.add_listener``
        in :mod:`holocron.api.dependencies` so any asset/actor/rule/relation
        create/update/delete clears the cache. The next ``get_map`` call
        rebuilds it under the lock."""
        self._cache = None

    async def get_map(self, lod: LodTier) -> GraphMapResponse:
        if self._cache is None:
            async with self._lock:
                if self._cache is None:
                    self._cache = await self._build()
        full = self._cache
        if lod >= LodTier.ENTITIES:
            return full
        allowed = {n.id for n in full.nodes if n.lod <= lod}
        return GraphMapResponse(
            lod=lod,
            nodes=[n for n in full.nodes if n.id in allowed],
            edges=[
                e
                for e in full.edges
                if e.source in allowed and e.target in allowed
            ],
            bounds=full.bounds,
        )

    async def _build(self) -> GraphMapResponse:
        """Query Neo4j for first-class nodes + edges, compute a spring
        layout, and produce the cacheable map."""
        raw_nodes, raw_edges = await self._fetch_topology()
        if not raw_nodes:
            return GraphMapResponse(
                lod=LodTier.ENTITIES,
                nodes=[],
                edges=[],
                bounds=(0, 0, 0, 0, 0, 0),
            )

        positions = self._layout(raw_nodes, raw_edges)
        degree = _degree(raw_nodes, raw_edges)
        cluster_assignment = _assign_clusters(raw_nodes, raw_edges)

        nodes: list[GraphNode] = []
        for rn in raw_nodes:
            kind = _kind_of(rn.label)
            if kind is None:
                continue
            x, y, z = positions[rn.uid]
            d = degree.get(rn.uid, 0)
            nodes.append(
                GraphNode(
                    id=rn.uid,
                    label=rn.name,
                    kind=kind,
                    subtype=rn.subtype,
                    lod=_lod_for(kind, rn.subtype),
                    x=x,
                    y=y,
                    z=z,
                    degree=d,
                    size=_size_from_degree(d),
                    cluster_id=cluster_assignment.get(rn.uid),
                )
            )

        node_ids = {n.id for n in nodes}
        edges: list[GraphEdge] = []
        for re in raw_edges:
            if re.source not in node_ids or re.target not in node_ids:
                continue
            # An edge is only visible once both endpoints are.
            src_lod = next(n.lod for n in nodes if n.id == re.source)
            tgt_lod = next(n.lod for n in nodes if n.id == re.target)
            edges.append(
                GraphEdge(
                    id=re.uid,
                    source=re.source,
                    target=re.target,
                    type=re.type,
                    lod=LodTier(max(src_lod, tgt_lod)),
                )
            )

        xs = [n.x for n in nodes]
        ys = [n.y for n in nodes]
        zs = [n.z for n in nodes]
        bounds = (
            min(xs),
            min(ys),
            min(zs),
            max(xs),
            max(ys),
            max(zs),
        )

        clusters = _build_clusters(raw_nodes, cluster_assignment, positions, degree)

        logger.info(
            "graph.map built nodes=%d edges=%d tier0_nodes=%d clusters=%d",
            len(nodes),
            len(edges),
            sum(1 for n in nodes if n.lod == LodTier.OVERVIEW),
            len(clusters),
        )
        return GraphMapResponse(
            lod=LodTier.ENTITIES,
            nodes=nodes,
            edges=edges,
            clusters=clusters,
            bounds=bounds,
        )

    async def _fetch_topology(self) -> tuple[list[_RawNode], list[_RawEdge]]:
        """One Cypher round-trip: nodes first, then edges. Two queries
        are simpler to reason about than one UNION and fast enough for
        the spike."""
        node_cypher = """
            MATCH (n)
            WHERE n:Asset OR n:Actor OR n:Rule
            RETURN
                n.uid AS uid,
                labels(n) AS labels,
                n.name AS name,
                coalesce(n.type, n.severity, 'unknown') AS subtype
        """
        edge_types = ",".join(f"'{t}'" for t in _MAP_EDGE_TYPES)
        edge_cypher = f"""
            MATCH (a)-[r]->(b)
            WHERE (a:Asset OR a:Actor OR a:Rule)
              AND (b:Asset OR b:Actor OR b:Rule)
              AND type(r) IN [{edge_types}]
            RETURN
                coalesce(r.uid, elementId(r)) AS uid,
                a.uid AS source,
                b.uid AS target,
                type(r) AS type
        """
        raw_nodes: list[_RawNode] = []
        raw_edges: list[_RawEdge] = []
        async with self._driver.session() as session:
            node_result = await session.run(node_cypher)
            async for rec in node_result:
                labels: list[str] = rec["labels"]
                # First-class label wins (a node can be Asset+Thing; we
                # only care about the one we query on).
                label = next(
                    (lab for lab in labels if lab in ("Asset", "Actor", "Rule")),
                    None,
                )
                if label is None or rec["uid"] is None:
                    continue
                raw_nodes.append(
                    _RawNode(
                        uid=rec["uid"],
                        label=label,
                        name=rec["name"] or rec["uid"],
                        subtype=(rec["subtype"] or "unknown").lower(),
                    )
                )

            edge_result = await session.run(edge_cypher)
            async for rec in edge_result:
                raw_edges.append(
                    _RawEdge(
                        uid=str(rec["uid"]),
                        source=rec["source"],
                        target=rec["target"],
                        type=str(rec["type"]).lower(),
                    )
                )
        return raw_nodes, raw_edges

    def _layout(
        self, raw_nodes: list[_RawNode], raw_edges: list[_RawEdge]
    ) -> dict[str, tuple[float, float, float]]:
        """Run a deterministic 3D spring layout over the whole entity
        graph, scaled to a render-friendly coordinate range.

        Tier-0 nodes (systems + teams) are pinned to the galactic plane
        `z≈0` in a ring so the overview reads as a clean constellation
        when viewed top-down; everything else is free to find its spot
        in 3D. Tier-1 nodes gravitate to a thin shell around the plane
        because their edges pull them toward the pinned tier-0 anchors.
        """
        g: nx.Graph = nx.Graph()
        for rn in raw_nodes:
            g.add_node(rn.uid)
        for re in raw_edges:
            g.add_edge(re.source, re.target)

        seeds: dict[str, tuple[float, float, float]] = {}
        tier0 = [
            rn
            for rn in raw_nodes
            if _lod_for(_kind_of(rn.label) or "asset", rn.subtype)
            == LodTier.OVERVIEW
        ]
        if tier0:
            for i, rn in enumerate(tier0):
                theta = 2 * math.pi * i / len(tier0)
                seeds[rn.uid] = (math.cos(theta), math.sin(theta), 0.0)

        positions = nx.spring_layout(
            g,
            dim=3,
            pos=seeds or None,
            fixed=list(seeds.keys()) if seeds else None,
            k=_LAYOUT_K / max(1, math.sqrt(len(g))),
            seed=_LAYOUT_SEED,
            iterations=60,
        )
        # Compress Z a bit so the layout reads as a thin-disc galaxy
        # rather than a sphere — still clearly 3D when rotated, but
        # keeps the top-down "architecture view" legible.
        z_squash = 0.4
        return {
            uid: (
                float(p[0]) * _LAYOUT_SCALE,
                float(p[1]) * _LAYOUT_SCALE,
                float(p[2]) * _LAYOUT_SCALE * z_squash,
            )
            for uid, p in positions.items()
        }


def _degree(nodes: list[_RawNode], edges: list[_RawEdge]) -> dict[str, int]:
    counts: dict[str, int] = {n.uid: 0 for n in nodes}
    for e in edges:
        if e.source in counts:
            counts[e.source] += 1
        if e.target in counts:
            counts[e.target] += 1
    return counts


def _size_from_degree(d: int) -> float:
    """Render size in Sigma's units. Log-scaled so a 100-degree hub is
    only ~3× a leaf, not 100×."""
    return round(4.0 + 2.0 * math.log1p(d), 2)


def _cluster_kind_of(rn: _RawNode) -> GraphClusterKind | None:
    """Identify cluster lead nodes — the systems and groups that anchor
    a cluster. Anything else is a candidate member, never a lead."""
    if rn.label == "Asset" and rn.subtype == "system":
        return "system"
    if rn.label == "Actor" and rn.subtype == "group":
        return "group"
    return None


def _assign_clusters(
    raw_nodes: list[_RawNode],
    raw_edges: list[_RawEdge],
) -> dict[str, str]:
    """For each node, decide which cluster lead it belongs to.

    Rules:
      1. A system asset or group actor IS a lead — it belongs to its own
         cluster.
      2. Otherwise, look at the node's neighbours (edges treated as
         undirected). If any neighbour is a system, the node joins that
         system's cluster. Else, if any neighbour is a group, it joins
         that group's cluster.
      3. Otherwise the node has no cluster — `cluster_id` stays null
         and the renderer treats it as a loose node.

    Determinism matters because the cluster id is what the client uses
    as a stable identity across reloads. If two systems both touch the
    same node, the lower-uid system wins (sort-then-pick) so reordering
    the input doesn't shuffle clusters.
    """
    leads_systems = {
        rn.uid for rn in raw_nodes if _cluster_kind_of(rn) == "system"
    }
    leads_groups = {
        rn.uid for rn in raw_nodes if _cluster_kind_of(rn) == "group"
    }
    all_nodes = {rn.uid for rn in raw_nodes}

    adj: dict[str, set[str]] = {uid: set() for uid in all_nodes}
    for e in raw_edges:
        if e.source in adj and e.target in adj:
            adj[e.source].add(e.target)
            adj[e.target].add(e.source)

    assignment: dict[str, str] = {}
    for rn in raw_nodes:
        if rn.uid in leads_systems or rn.uid in leads_groups:
            assignment[rn.uid] = rn.uid
            continue
        sys_neighbours = sorted(n for n in adj[rn.uid] if n in leads_systems)
        if sys_neighbours:
            assignment[rn.uid] = sys_neighbours[0]
            continue
        grp_neighbours = sorted(n for n in adj[rn.uid] if n in leads_groups)
        if grp_neighbours:
            assignment[rn.uid] = grp_neighbours[0]
    return assignment


def _build_clusters(
    raw_nodes: list[_RawNode],
    cluster_assignment: dict[str, str],
    positions: dict[str, tuple[float, float, float]],
    degrees: dict[str, int],
) -> list[GraphCluster]:
    """Build the cluster list from a node-to-lead assignment.

    One cluster per distinct lead. Centroid + radius are derived from
    the layout positions of the cluster's members so the renderer can
    place a single bubble at the cluster's spatial centre and frame
    fly-to camera moves around the bubble's bounding sphere.
    """
    members_by_lead: dict[str, list[str]] = {}
    for uid, lead_id in cluster_assignment.items():
        members_by_lead.setdefault(lead_id, []).append(uid)

    nodes_by_uid = {rn.uid: rn for rn in raw_nodes}
    clusters: list[GraphCluster] = []
    for lead_uid, member_uids in members_by_lead.items():
        lead = nodes_by_uid.get(lead_uid)
        if lead is None:
            continue
        kind = _cluster_kind_of(lead)
        if kind is None:
            continue

        # Stable sort so the wire order matches the assignment — keeps
        # diffs against snapshot tests minimal.
        member_uids.sort()

        positioned = [u for u in member_uids if u in positions]
        if positioned:
            xs = [positions[u][0] for u in positioned]
            ys = [positions[u][1] for u in positioned]
            zs = [positions[u][2] for u in positioned]
            cx = sum(xs) / len(xs)
            cy = sum(ys) / len(ys)
            cz = sum(zs) / len(zs)
            spread = max(
                math.sqrt(
                    (positions[u][0] - cx) ** 2
                    + (positions[u][1] - cy) ** 2
                    + (positions[u][2] - cz) ** 2
                )
                for u in positioned
            )
        else:
            cx = cy = cz = 0.0
            spread = 0.0

        clusters.append(
            GraphCluster(
                id=lead_uid,
                label=lead.name,
                kind=kind,
                member_ids=member_uids,
                centroid_x=cx,
                centroid_y=cy,
                centroid_z=cz,
                # Floor of 50 so a singleton cluster (just the lead) still
                # renders a hittable bubble; otherwise the radius is the
                # tightest sphere around its members.
                radius=max(spread, 50.0),
                degree=sum(degrees.get(u, 0) for u in member_uids),
                level=0,
                parent_id=None,
            )
        )

    # Stable cluster ordering — by id — to keep the wire output
    # predictable across rebuilds.
    clusters.sort(key=lambda c: c.id)
    return clusters
