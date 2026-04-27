"""Relation schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RelationType(str, Enum):
    """Valid relation types.

    Data-flow lineage is asset-only: the single FEEDS edge covers
    upstream → downstream flow between any two assets (including
    processes, which participate as plain asset nodes). We intentionally
    do not carry PRODUCES/CONSUMES or DERIVED_FROM so the same data flow
    never has two parallel encodings.
    """

    # Actor -> Asset
    OWNS = "owns"
    USES = "uses"

    # Asset -> Asset (lineage)
    FEEDS = "feeds"

    # Parent -> Child (structural, e.g. system contains dataset)
    CONTAINS = "contains"

    # Actor -> Actor
    MEMBER_OF = "member_of"

    # Rule -> Asset
    # Properties carry {enforcement: "enforced"|"alerting"|"documented",
    #                   field_path: "Sheet/Table/Col" | null, note?: str}
    APPLIES_TO = "applies_to"


class RelationCreate(BaseModel):
    """Request body for creating a relation."""

    uid: str | None = Field(
        None,
        description="Optional client-supplied UID for idempotent creation. Auto-generated if not provided.",
    )
    from_uid: str = Field(..., description="UID of the source node")
    to_uid: str = Field(..., description="UID of the target node")
    type: RelationType
    verified: bool = True
    discovered_by: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class RelationResponse(BaseModel):
    """Response model for a single relation."""

    uid: str
    from_uid: str
    to_uid: str
    type: RelationType
    verified: bool
    discovered_by: str | None
    properties: dict[str, Any]
    created_at: datetime


class RelationListResponse(BaseModel):
    """Response model for listing relations."""

    items: list[RelationResponse]
    total: int
