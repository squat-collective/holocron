"""Relation schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RelationType(str, Enum):
    """Valid relation types."""

    # Actor -> Asset
    OWNS = "owns"
    USES = "uses"

    # Asset -> Asset
    FEEDS = "feeds"
    DERIVED_FROM = "derived_from"

    # System/Process -> Asset
    CONTAINS = "contains"
    PRODUCES = "produces"
    CONSUMES = "consumes"

    # Actor -> Actor
    MEMBER_OF = "member_of"


class RelationCreate(BaseModel):
    """Request body for creating a relation."""

    from_uid: str = Field(..., description="UID of the source node")
    to_uid: str = Field(..., description="UID of the target node")
    type: RelationType
    properties: dict[str, Any] = Field(default_factory=dict)


class RelationResponse(BaseModel):
    """Response model for a single relation."""

    uid: str
    from_uid: str
    to_uid: str
    type: RelationType
    properties: dict[str, Any]
    created_at: datetime


class RelationListResponse(BaseModel):
    """Response model for listing relations."""

    items: list[RelationResponse]
    total: int
