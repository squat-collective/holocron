"""Event schemas for API responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventAction(str, Enum):
    """Types of audit actions."""

    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"


class EntityType(str, Enum):
    """Types of entities that can be tracked."""

    ASSET = "asset"
    ACTOR = "actor"
    RELATION = "relation"
    RULE = "rule"
    TERM = "term"


class EventResponse(BaseModel):
    """Response model for a single event."""

    uid: str
    action: EventAction
    entity_type: EntityType
    entity_uid: str
    actor_uid: str | None
    timestamp: datetime
    changes: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventListResponse(BaseModel):
    """Response model for listing events."""

    items: list[EventResponse]
    total: int
