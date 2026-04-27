"""Asset schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AssetType(str, Enum):
    """Valid asset types."""

    DATASET = "dataset"
    REPORT = "report"
    PROCESS = "process"
    SYSTEM = "system"


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
