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

from holocron.core.services.graph_service import _MAP_EDGE_TYPES
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
