"""Unit tests for the graph-map service.

We don't hit Neo4j here — the layout + cache logic is exercised in
``test_webhooks.py`` (via the invalidation listener). This file owns
the structural invariants of the data-landscape map: which relation
types contribute edges, and which kinds count as first-class nodes.
The bar is "a release shouldn't be able to silently drop a relation
type from the map" — that bug shipped in v0.0.x and surfaced as
issue #4 (asset CONTAINS edges invisible).
"""

from __future__ import annotations

from holocron.core.services.graph_service import (
    _MAP_EDGE_TYPES,
    _RawEdge,
    _RawNode,
    _assign_clusters,
    _build_clusters,
)
from holocron.db.utils import ALLOWED_RELATIONSHIP_TYPES


class TestMapEdgeTypes:
    def test_includes_contains(self) -> None:
        """Regression: CONTAINS is a real Asset->Asset relation (a system
        contains its reports, an app contains its dashboards). It was
        missing from the map's whitelist in v0.0.x — issue #4."""
        assert "CONTAINS" in _MAP_EDGE_TYPES

    def test_matches_allowed_relationship_types(self) -> None:
        """The map should render every relation type the API actually
        accepts. Drift between these two sets is what made #4 silently
        invisible — a relation could be created, persisted, and never
        appear on /map. Locking the equality here keeps that closed."""
        assert frozenset(_MAP_EDGE_TYPES) == ALLOWED_RELATIONSHIP_TYPES


def _node(uid: str, label: str, subtype: str) -> _RawNode:
    return _RawNode(uid=uid, label=label, name=uid, subtype=subtype)


def _edge(src: str, tgt: str, t: str = "CONTAINS") -> _RawEdge:
    return _RawEdge(uid=f"{src}->{tgt}", source=src, target=tgt, type=t)


class TestAssignClusters:
    def test_lead_is_its_own_cluster(self) -> None:
        """System assets and group actors are themselves cluster leads —
        they belong to a cluster keyed by their own UID."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("grp-x", "Actor", "group"),
        ]
        assignment = _assign_clusters(nodes, [])
        assert assignment == {"sys-a": "sys-a", "grp-x": "grp-x"}

    def test_member_joins_neighbour_system(self) -> None:
        """A non-lead node connected to a system asset joins that
        system's cluster — even when the edge runs system→node."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("ds-1", "Asset", "dataset"),
        ]
        edges = [_edge("sys-a", "ds-1", "CONTAINS")]
        assert _assign_clusters(nodes, edges) == {
            "sys-a": "sys-a",
            "ds-1": "sys-a",
        }

    def test_edge_direction_is_irrelevant(self) -> None:
        """Cluster membership treats edges as undirected — a node owned
        by a system (asset→system OWNS edge) still joins the system's
        cluster."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("ds-1", "Asset", "dataset"),
        ]
        edges = [_edge("ds-1", "sys-a", "OWNS")]
        assert _assign_clusters(nodes, edges)["ds-1"] == "sys-a"

    def test_system_wins_over_group(self) -> None:
        """When a node is connected to both a system and a group, the
        system wins — system membership is the stronger spatial cue
        on the map."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("grp-x", "Actor", "group"),
            _node("ds-1", "Asset", "dataset"),
        ]
        edges = [
            _edge("sys-a", "ds-1", "CONTAINS"),
            _edge("grp-x", "ds-1", "OWNS"),
        ]
        assert _assign_clusters(nodes, edges)["ds-1"] == "sys-a"

    def test_group_fallback_when_no_system(self) -> None:
        """A node with no system connection but with a group connection
        joins the group's cluster."""
        nodes = [
            _node("grp-x", "Actor", "group"),
            _node("p-1", "Actor", "person"),
        ]
        edges = [_edge("p-1", "grp-x", "MEMBER_OF")]
        assert _assign_clusters(nodes, edges)["p-1"] == "grp-x"

    def test_unaffiliated_node_has_no_assignment(self) -> None:
        """Nodes with no system or group neighbour stay loose — the
        assignment dict simply doesn't list them."""
        nodes = [
            _node("ds-1", "Asset", "dataset"),
            _node("ds-2", "Asset", "dataset"),
        ]
        edges = [_edge("ds-1", "ds-2", "FEEDS")]
        assignment = _assign_clusters(nodes, edges)
        assert "ds-1" not in assignment
        assert "ds-2" not in assignment

    def test_deterministic_when_two_systems_touch_same_node(self) -> None:
        """If two systems both connect to a node, the lower-uid one
        wins. Determinism matters: cluster ids are cached client-side
        and need to stay stable across rebuilds."""
        nodes = [
            _node("sys-b", "Asset", "system"),
            _node("sys-a", "Asset", "system"),
            _node("ds-1", "Asset", "dataset"),
        ]
        edges = [
            _edge("sys-b", "ds-1", "CONTAINS"),
            _edge("sys-a", "ds-1", "CONTAINS"),
        ]
        assert _assign_clusters(nodes, edges)["ds-1"] == "sys-a"


class TestBuildClusters:
    def test_singleton_cluster_gets_radius_floor(self) -> None:
        """A cluster with just its lead has zero spatial spread; we
        floor the radius so the bubble is still hittable on the map."""
        nodes = [_node("sys-a", "Asset", "system")]
        positions = {"sys-a": (10.0, 20.0, 30.0)}
        clusters = _build_clusters(
            nodes, {"sys-a": "sys-a"}, positions, {"sys-a": 0}
        )
        assert len(clusters) == 1
        assert clusters[0].radius >= 50.0
        assert clusters[0].centroid_x == 10.0
        assert clusters[0].member_ids == ["sys-a"]

    def test_centroid_is_member_mean(self) -> None:
        """Cluster centroid = arithmetic mean of member positions."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("ds-1", "Asset", "dataset"),
        ]
        positions = {"sys-a": (0.0, 0.0, 0.0), "ds-1": (200.0, 0.0, 0.0)}
        clusters = _build_clusters(
            nodes,
            {"sys-a": "sys-a", "ds-1": "sys-a"},
            positions,
            {"sys-a": 1, "ds-1": 1},
        )
        cluster = clusters[0]
        assert cluster.centroid_x == 100.0
        assert cluster.centroid_y == 0.0
        # Radius is distance from centroid to the farthest member.
        assert cluster.radius == 100.0

    def test_cluster_kind_reflects_lead_type(self) -> None:
        """Clusters carry their lead's kind so the renderer can pick
        the right icon for the bubble."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("grp-x", "Actor", "group"),
        ]
        positions = {"sys-a": (0.0, 0.0, 0.0), "grp-x": (100.0, 0.0, 0.0)}
        assignment = {"sys-a": "sys-a", "grp-x": "grp-x"}
        clusters = _build_clusters(
            nodes, assignment, positions, {"sys-a": 0, "grp-x": 0}
        )
        kinds = {c.id: c.kind for c in clusters}
        assert kinds == {"sys-a": "system", "grp-x": "group"}

    def test_cluster_degree_sums_member_degrees(self) -> None:
        """Cluster degree = sum of member degrees. Used as the priority
        score for budget-driven expansion (high-degree clusters open
        first)."""
        nodes = [
            _node("sys-a", "Asset", "system"),
            _node("ds-1", "Asset", "dataset"),
            _node("ds-2", "Asset", "dataset"),
        ]
        positions = {
            "sys-a": (0.0, 0.0, 0.0),
            "ds-1": (10.0, 0.0, 0.0),
            "ds-2": (-10.0, 0.0, 0.0),
        }
        clusters = _build_clusters(
            nodes,
            {"sys-a": "sys-a", "ds-1": "sys-a", "ds-2": "sys-a"},
            positions,
            {"sys-a": 2, "ds-1": 3, "ds-2": 5},
        )
        assert clusters[0].degree == 10

    def test_clusters_sorted_by_id(self) -> None:
        """The output cluster list is ordered by id — stable wire
        format keeps client diffs minimal."""
        nodes = [
            _node("sys-z", "Asset", "system"),
            _node("sys-a", "Asset", "system"),
            _node("grp-m", "Actor", "group"),
        ]
        positions = {
            "sys-z": (0.0, 0.0, 0.0),
            "sys-a": (0.0, 0.0, 0.0),
            "grp-m": (0.0, 0.0, 0.0),
        }
        assignment = {"sys-z": "sys-z", "sys-a": "sys-a", "grp-m": "grp-m"}
        clusters = _build_clusters(
            nodes, assignment, positions, {"sys-z": 0, "sys-a": 0, "grp-m": 0}
        )
        assert [c.id for c in clusters] == ["grp-m", "sys-a", "sys-z"]
