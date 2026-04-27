"""Schemas for the `/graph` endpoints — the data-landscape map.

The `/graph/map` endpoint returns a *tile-shaped* payload: every node
carries its final `(x, y)` world coordinate plus a `lod` tier. A client
renders the whole thing with a WebGL graph library (Sigma.js) and filters
by `lod` as the user zooms in or out.

The contract is deliberately the same shape it will need when the dataset
outgrows a single payload and we switch to true viewport tiles
(`/graph/tile?bbox=x0,y0,x1,y1&lod=N`) — the renderer code won't change.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Literal

from pydantic import BaseModel, Field


class LodTier(IntEnum):
    """Level-of-detail tiers.

    `tier 0` is the "max zoom out architecture view" — only top-level
    entities (systems + teams). `tier 1` adds every first-class node
    (assets, people, rules). Future `tier 2` would add schema nodes
    (containers + fields).
    """

    OVERVIEW = 0  # systems + teams only
    ENTITIES = 1  # + datasets, reports, processes, people, rules


GraphNodeKind = Literal["asset", "actor", "rule"]


class GraphNode(BaseModel):
    """A node on the map, with its pre-computed world coordinates.

    Coordinates are in a 3D space: `(x, y)` is the galactic plane,
    `z` is the layer offset so LOD tiers visually stack (tier 0 sits on
    `z≈0`, tier 1 spreads in a thin shell around it). A 2D renderer can
    ignore `z` entirely.
    """

    id: str = Field(..., description="Unique id (entity UID)")
    label: str = Field(..., description="Display label")
    kind: GraphNodeKind
    subtype: str = Field(
        ..., description="Asset type, actor type, or rule severity — drives node color"
    )
    lod: LodTier = Field(
        ..., description="Lowest LOD tier at which this node becomes visible"
    )
    x: float
    y: float
    z: float = Field(0.0, description="Depth coordinate (0 for 2D layouts)")
    degree: int = Field(
        0, description="Relation count — drives hub glow on the 3D renderer"
    )
    size: float = Field(
        ..., description="Render size hint (degree-based, already normalized)"
    )


class GraphEdge(BaseModel):
    """A relation between two map nodes. Both endpoints are always visible
    at their declared `lod`; edges inherit the higher of the two tiers."""

    id: str
    source: str
    target: str
    type: str = Field(..., description="Relation type: owns, uses, feeds, …")
    lod: LodTier


class GraphMapResponse(BaseModel):
    """The data-landscape map at a given LOD ceiling."""

    lod: LodTier
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    bounds: tuple[float, float, float, float, float, float] = Field(
        ...,
        description=(
            "Layout bounding box in 3D: "
            "(x_min, y_min, z_min, x_max, y_max, z_max)."
        ),
    )
