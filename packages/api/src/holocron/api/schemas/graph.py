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
    cluster_id: str | None = Field(
        None,
        description=(
            "Id of the GraphCluster this node belongs to (the system/group's "
            "UID), or null if the node is loose (no system/group connection)."
        ),
    )


GraphClusterKind = Literal["system", "group"]


class GraphCluster(BaseModel):
    """A precomputed group of nodes the renderer can collapse into one
    bubble at far zoom and expand into individual members when zoomed in.

    Two cluster kinds at level 0:
      - ``system``: led by an Asset of subtype ``system``; members are
        the system itself plus every node connected to it via a map edge
        (CONTAINS, OWNS, etc.) that isn't itself a cluster lead.
      - ``group``: led by an Actor of subtype ``group``; members are the
        group plus every actor connected to it (typically via MEMBER_OF).

    Nodes not connected to any cluster lead get ``cluster_id=null`` and
    are rendered as loose nodes alongside the cluster bubbles.
    """

    id: str = Field(
        ..., description="Cluster id — the lead system/group's UID."
    )
    label: str = Field(..., description="Display label — the lead's name.")
    kind: GraphClusterKind = Field(
        ..., description="What kind of lead drives this cluster."
    )
    member_ids: list[str] = Field(
        ...,
        description=(
            "Every node belonging to this cluster, including the lead "
            "itself. Used by the budget-driven expansion to know how "
            "many things the cluster expands into."
        ),
    )
    centroid_x: float
    centroid_y: float
    centroid_z: float
    radius: float = Field(
        ...,
        description=(
            "Bounding-sphere radius around the centroid, in world units. "
            "Drives the cluster bubble's render size and the camera "
            "fly-to framing when the user clicks a bubble."
        ),
    )
    degree: int = Field(
        0,
        description=(
            "Sum of member degrees — proxy for cluster importance, used "
            "by the budget-driven expansion to rank which clusters open "
            "first."
        ),
    )
    level: int = Field(
        0,
        description=(
            "Depth in the cluster hierarchy. 0 = top-level groups; "
            "1+ reserved for community-detected sub-clusters of a huge "
            "level-0 group (deferred until needed)."
        ),
    )
    parent_id: str | None = Field(
        None,
        description=(
            "Id of the parent cluster (for level-1+ sub-clusters). Null "
            "at level 0."
        ),
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
    clusters: list[GraphCluster] = Field(
        default_factory=list,
        description=(
            "Precomputed cluster hierarchy. The renderer uses this to "
            "decide which nodes to collapse into a single bubble at far "
            "zoom under a node-count budget. Empty when there are no "
            "system/group leads in the graph."
        ),
    )
    bounds: tuple[float, float, float, float, float, float] = Field(
        ...,
        description=(
            "Layout bounding box in 3D: "
            "(x_min, y_min, z_min, x_max, y_max, z_max)."
        ),
    )
