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

    type: AssetType
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    status: AssetStatus = AssetStatus.ACTIVE
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    """Request body for updating an asset."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    status: AssetStatus | None = None
    metadata: dict[str, Any] | None = None


class AssetResponse(BaseModel):
    """Response model for a single asset."""

    uid: str
    type: AssetType
    name: str
    description: str | None
    location: str | None
    status: AssetStatus
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class AssetListResponse(BaseModel):
    """Response model for listing assets."""

    items: list[AssetResponse]
    total: int
