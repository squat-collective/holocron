"""Snapshot models — what the renderer consumes.

Mirror of `excel_exporter.models` but kept as a separate copy so this
plugin doesn't take a runtime dep on its sibling. The shapes are
deliberately narrow — just what we render.
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


class CatalogSnapshot(BaseModel):
    fetched_at: datetime
    assets: list[AssetRecord] = Field(default_factory=list)
    actors: list[ActorRecord] = Field(default_factory=list)
    relations: list[RelationRecord] = Field(default_factory=list)
