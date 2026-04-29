"""Domain models."""

from datetime import UTC, datetime
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
    """Types of relationships between entities.

    Lineage between assets is expressed solely through FEEDS
    (source -[:FEEDS]-> target, meaning source is upstream of target).
    Process assets participate in lineage as regular asset nodes, not via
    a separate PRODUCES/CONSUMES vocabulary, so the data-flow graph stays
    asset-only and free of redundant parallel encodings.
    """

    OWNS = "owns"
    USES = "uses"
    FEEDS = "feeds"
    CONTAINS = "contains"
    MEMBER_OF = "member_of"
    APPLIES_TO = "applies_to"  # Rule → Asset (carries enforcement + field_path in properties)
    # Glossary edges — wire business terms into the catalog.
    DEFINES = "defines"  # Term → Asset (this term is realised by this asset / column)
    STEWARDS = "stewards"  # Actor → Term (actor maintains the canonical definition)
    RELATED_TO = "related_to"  # Term ↔ Term (loose semantic association)
    SYNONYM_OF = "synonym_of"  # Term ↔ Term (treat as the same concept for search)


class RuleSeverity(str, Enum):
    """How bad a rule violation is, inherent to the kind of rule."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class RuleEnforcement(str, Enum):
    """Per-relation state: where we are on enforcing this rule against this asset.

    Lives on the APPLIES_TO relation's properties, not on the Rule itself —
    same rule can be enforced on prod, alerting on staging, aspirational on legacy.
    """

    ENFORCED = "enforced"  # Rule is actively checked and failures block/hard-fail
    ALERTING = "alerting"  # Rule is checked, failure alerts but does not block
    DOCUMENTED = "documented"  # Rule is written down; no check in place yet


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


class TermStatus(str, Enum):
    """Glossary term lifecycle status.

    `draft` — proposed, not yet endorsed.
    `approved` — the canonical definition; UI should prefer this in suggestions.
    `deprecated` — superseded; kept for back-references but suggestions filter it out.
    """

    DRAFT = "draft"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class Asset(BaseModel):
    """A data asset in the system."""

    uid: str
    type: AssetType
    name: str
    description: str | None = None
    location: str | None = None
    status: AssetStatus = AssetStatus.ACTIVE
    verified: bool = True
    discovered_by: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)


class Actor(BaseModel):
    """A person or group that interacts with assets."""

    uid: str
    type: ActorType
    name: str
    email: str | None = None
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Relation(BaseModel):
    """A relationship between two entities."""

    uid: str
    type: RelationType
    source_uid: str
    target_uid: str
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Rule(BaseModel):
    """A data quality rule — what data should respect.

    A rule is the declarative *what*. The enforcement state (where we're at
    implementing it for a given asset) lives on the APPLIES_TO relation, so
    the same rule can be enforced on prod while still only documented on legacy.
    """

    uid: str
    name: str
    description: str
    severity: RuleSeverity = RuleSeverity.WARNING
    category: str | None = None
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Event(BaseModel):
    """An audit log event."""

    uid: str
    action: EventAction
    entity_type: EntityType
    entity_uid: str
    actor_uid: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    changes: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Term(BaseModel):
    """A business glossary term — the canonical name + definition for a
    business concept (e.g. "Active Customer", "Revenue").

    Terms exist alongside assets: an asset/column is a *physical*
    artefact, a term is a *semantic* contract. They wire together via
    `Term -[:DEFINES]-> Asset`. `domain` is intentionally free-form text
    rather than an enum so each org can grow its own taxonomy without a
    migration.
    """

    uid: str
    name: str
    definition: str
    domain: str | None = None
    status: TermStatus = TermStatus.DRAFT
    formula: str | None = None
    unit: str | None = None
    pii: bool = False
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
