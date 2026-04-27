"""Actor schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class ActorType(str, Enum):
    """Valid actor types."""

    PERSON = "person"
    GROUP = "group"


class ActorCreate(BaseModel):
    """Request body for creating an actor."""

    uid: str | None = Field(
        None,
        description="Optional client-supplied UID for idempotent creation. Auto-generated if not provided.",
    )
    type: ActorType
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr | None = None
    description: str | None = None
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActorUpdate(BaseModel):
    """Request body for updating an actor."""

    name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    description: str | None = None
    verified: bool | None = None
    discovered_by: str | None = None
    metadata: dict[str, Any] | None = None


class ActorResponse(BaseModel):
    """Response model for a single actor."""

    uid: str
    type: ActorType
    name: str
    email: str | None
    description: str | None
    verified: bool
    discovered_by: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ActorListResponse(BaseModel):
    """Response model for listing actors."""

    items: list[ActorResponse]
    total: int
