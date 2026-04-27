"""Snapshot models — what the renderer consumes.

Same shape as `lineage_gap_audit.models` (assets, actors, relations,
rules), kept as an independent copy so the two plugins stay
independently versionable.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AssetRecord(BaseModel):
    uid: str
    type: str
    name: str
    description: str | None = None
    location: str | None = None
    status: str
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ActorRecord(BaseModel):
    uid: str
    type: str
    name: str
    email: str | None = None
    description: str | None = None
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class RelationRecord(BaseModel):
    uid: str
    from_uid: str
    to_uid: str
    type: str
    verified: bool = True
    discovered_by: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class RuleRecord(BaseModel):
    uid: str
    name: str
    description: str | None = None
    severity: str
    category: str | None = None
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class CatalogSnapshot(BaseModel):
    fetched_at: datetime
    assets: list[AssetRecord] = Field(default_factory=list)
    actors: list[ActorRecord] = Field(default_factory=list)
    relations: list[RelationRecord] = Field(default_factory=list)
    rules: list[RuleRecord] = Field(default_factory=list)
