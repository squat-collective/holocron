"""Term schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TermStatus(str, Enum):
    """Glossary term lifecycle status."""

    DRAFT = "draft"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class TermCreate(BaseModel):
    """Request body for creating a term."""

    uid: str | None = Field(
        None,
        description="Optional client-supplied UID for idempotent creation. Auto-generated if not provided.",
    )
    name: str = Field(..., min_length=1, max_length=255)
    definition: str = Field(..., min_length=1)
    domain: str | None = Field(
        None,
        description="Free-form domain label (e.g. 'Finance', 'Marketing'). Not enumerated — each org grows its own.",
    )
    status: TermStatus = TermStatus.DRAFT
    formula: str | None = None
    unit: str | None = None
    pii: bool = False
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TermUpdate(BaseModel):
    """Request body for updating a term."""

    name: str | None = Field(None, min_length=1, max_length=255)
    definition: str | None = Field(None, min_length=1)
    domain: str | None = None
    status: TermStatus | None = None
    formula: str | None = None
    unit: str | None = None
    pii: bool | None = None
    verified: bool | None = None
    discovered_by: str | None = None
    metadata: dict[str, Any] | None = None


class TermResponse(BaseModel):
    """Response model for a single term."""

    uid: str
    name: str
    definition: str
    domain: str | None
    status: TermStatus
    formula: str | None
    unit: str | None
    pii: bool
    verified: bool
    discovered_by: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class TermListResponse(BaseModel):
    """Response model for listing terms."""

    items: list[TermResponse]
    total: int
