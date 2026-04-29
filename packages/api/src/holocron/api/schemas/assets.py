"""Asset schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AssetType(str, Enum):
    """Valid asset types.

    Hierarchical members (schema/table/column, sheet/page/visual,
    measure/dimension/model, endpoint/field) are linked to their parent
    via a `contains` relation, which lets clients walk an asset's tree
    via `GET /assets/{uid}/tree`.
    """

    # Top-level / "thing" assets
    DATASET = "dataset"
    REPORT = "report"
    PROCESS = "process"
    SYSTEM = "system"

    # Database hierarchy
    SCHEMA = "schema"
    TABLE = "table"
    VIEW = "view"
    COLUMN = "column"

    # Report hierarchy
    SHEET = "sheet"
    PAGE = "page"
    VISUAL = "visual"

    # BI / semantic-model elements
    MEASURE = "measure"
    DIMENSION = "dimension"
    MODEL = "model"

    # API hierarchy
    ENDPOINT = "endpoint"
    FIELD = "field"


class AssetStatus(str, Enum):
    """Asset lifecycle status."""

    ACTIVE = "active"
    DEPRECATED = "deprecated"
    DRAFT = "draft"


class AssetCreate(BaseModel):
    """Request body for creating an asset."""

    uid: str | None = Field(
        None,
        description="Optional client-supplied UID for idempotent creation. Auto-generated if not provided.",
    )
    type: AssetType
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    status: AssetStatus = AssetStatus.ACTIVE
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    """Request body for updating an asset."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    status: AssetStatus | None = None
    verified: bool | None = None
    discovered_by: str | None = None
    metadata: dict[str, Any] | None = None


class AssetResponse(BaseModel):
    """Response model for a single asset."""

    uid: str
    type: AssetType
    name: str
    description: str | None
    location: str | None
    status: AssetStatus
    verified: bool
    discovered_by: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class AssetListResponse(BaseModel):
    """Response model for listing assets."""

    items: list[AssetResponse]
    total: int


class AssetTreeNode(BaseModel):
    """An asset returned as part of a `contains` tree walk.

    `children` is populated up to the requested depth (1 = direct
    children, N = N levels). Beyond the requested depth, children is an
    empty list — even if more descendants exist in the graph.
    """

    asset: AssetResponse
    children: list["AssetTreeNode"] = Field(default_factory=list)


class AssetSchemaChildCreate(BaseModel):
    """A child node passed to the bulk-schema endpoint.

    Same shape as `AssetCreate` minus the optional UID, plus a `children`
    list for nested creation. Each child is created as a new asset and
    linked to its parent via a `contains` relation.
    """

    type: AssetType
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    status: AssetStatus = AssetStatus.ACTIVE
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    children: list["AssetSchemaChildCreate"] = Field(default_factory=list)


class AssetSchemaCreate(BaseModel):
    """Request body for `POST /assets/{uid}/schema`."""

    children: list[AssetSchemaChildCreate]


# Pydantic v2 needs an explicit rebuild for the recursive `children` field.
AssetSchemaChildCreate.model_rebuild()
AssetTreeNode.model_rebuild()
