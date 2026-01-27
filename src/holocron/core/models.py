"""Domain models."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AssetType(str, Enum):
    """Types of data assets."""

    DATASET = "dataset"
    REPORT = "report"
    PROCESS = "process"
    SYSTEM = "system"


class ActorType(str, Enum):
    """Types of actors."""

    PERSON = "person"
    GROUP = "group"


class AssetStatus(str, Enum):
    """Asset lifecycle status."""

    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"


class RelationType(str, Enum):
    """Types of relationships between entities."""

    OWNS = "owns"
    USES = "uses"
    FEEDS = "feeds"
    DERIVED_FROM = "derived_from"
    CONTAINS = "contains"
    PRODUCES = "produces"
    CONSUMES = "consumes"
    MEMBER_OF = "member_of"


class Asset(BaseModel):
    """A data asset in the system."""

    uid: str
    type: AssetType
    name: str
    description: str | None = None
    location: str | None = None
    status: AssetStatus = AssetStatus.ACTIVE
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Actor(BaseModel):
    """A person or group that interacts with assets."""

    uid: str
    type: ActorType
    name: str
    email: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Relation(BaseModel):
    """A relationship between two entities."""

    uid: str
    type: RelationType
    source_uid: str
    target_uid: str
    metadata: dict[str, Any] = Field(default_factory=dict)
