"""Schemas for the cross-entity /search endpoint."""

from typing import Literal

from pydantic import BaseModel, Field

from holocron.api.schemas.actors import ActorType
from holocron.api.schemas.assets import AssetStatus, AssetType
from holocron.api.schemas.rules import RuleSeverity


class AssetHit(BaseModel):
    """An asset that matched the query."""

    kind: Literal["asset"] = "asset"
    uid: str
    name: str
    description: str | None
    type: AssetType
    status: AssetStatus


class ContainerHit(BaseModel):
    """A schema container (table, sheet, section, …) that matched."""

    kind: Literal["container"] = "container"
    asset_uid: str
    asset_name: str
    name: str
    path: str = Field(..., description="Slash-joined path from asset root")
    container_type: str | None = None
    description: str | None = None


class FieldHit(BaseModel):
    """A schema field (column, measure, …) that matched."""

    kind: Literal["field"] = "field"
    asset_uid: str
    asset_name: str
    name: str
    path: str
    data_type: str | None = None
    pii: bool = False
    description: str | None = None


class ActorHit(BaseModel):
    """A person or team that matched."""

    kind: Literal["actor"] = "actor"
    uid: str
    name: str
    type: ActorType
    email: str | None = None
    description: str | None = None


class RuleHit(BaseModel):
    """A data-quality rule that matched."""

    kind: Literal["rule"] = "rule"
    uid: str
    name: str
    description: str
    severity: RuleSeverity
    category: str | None = None


SearchHit = AssetHit | ContainerHit | FieldHit | ActorHit | RuleHit


class SearchResponse(BaseModel):
    """Cross-entity search results."""

    items: list[SearchHit]
    total: int
