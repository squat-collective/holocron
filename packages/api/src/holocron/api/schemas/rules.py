"""Rule schemas for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RuleSeverity(str, Enum):
    """How bad a rule violation is, inherent to the kind of rule."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class RuleEnforcement(str, Enum):
    """Per-relation state — lives on the APPLIES_TO relation's properties,
    not on the Rule itself."""

    ENFORCED = "enforced"
    ALERTING = "alerting"
    DOCUMENTED = "documented"


class RuleCreate(BaseModel):
    """Request body for creating a rule."""

    uid: str | None = Field(
        None,
        description="Optional client-supplied UID for idempotent creation. Auto-generated if not provided.",
    )
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    severity: RuleSeverity = RuleSeverity.WARNING
    category: str | None = Field(None, max_length=100)
    verified: bool = True
    discovered_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RuleUpdate(BaseModel):
    """Request body for updating a rule. All fields optional."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    severity: RuleSeverity | None = None
    category: str | None = Field(None, max_length=100)
    verified: bool | None = None
    discovered_by: str | None = None
    metadata: dict[str, Any] | None = None


class RuleResponse(BaseModel):
    """Response model for a single rule."""

    uid: str
    name: str
    description: str
    severity: RuleSeverity
    category: str | None
    verified: bool
    discovered_by: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class RuleListResponse(BaseModel):
    """Response model for listing rules."""

    items: list[RuleResponse]
    total: int
