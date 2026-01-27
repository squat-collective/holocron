"""Reader data models."""

from typing import Any

from pydantic import BaseModel, Field

from holocron.core.models import AssetType


class Suggestion(BaseModel):
    """A suggested asset from a reader scan."""

    type: AssetType
    name: str
    description: str | None = None
    location: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ScanResult(BaseModel):
    """Result of a reader scan."""

    reader: str
    source: str
    suggestions: list[Suggestion] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
