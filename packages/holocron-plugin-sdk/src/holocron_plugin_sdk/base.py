"""Plugin protocol, manifest, context, and result types.

These are the shapes every Holocron plugin must satisfy. Mirror of
``holocron.plugins.base`` in the API package — kept structurally identical so
the API can validate plugin manifests against either copy. The SDK version
stays decoupled from the API: ``PluginContext`` service fields are typed as
``Any | None`` instead of importing concrete service classes.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol

from pydantic import BaseModel, Field


class PluginCapability(str, Enum):
    """What kind of action the plugin performs.

    - IMPORT: takes inputs (often a file), pushes assets/actors/relations to the API,
      returns a JSON summary that the UI renders as stat cards + a sample list.
    - EXPORT: produces a file download (no inputs needed in v0.1).
    """

    IMPORT = "import"
    EXPORT = "export"


class InputType(str, Enum):
    FILE = "file"
    STRING = "string"
    BOOLEAN = "boolean"


class InputSpec(BaseModel):
    """One input the plugin expects in `run()`.

    Drives both the API (multipart parsing) and the UI (form rendering).
    """

    name: str
    type: InputType
    label: str
    description: str | None = None
    accept: str | None = None  # e.g. ".xlsx,.xlsm" — only meaningful for FILE inputs
    required: bool = True
    default: Any = None


class PluginManifest(BaseModel):
    """Self-description of a plugin. Returned to the UI for auto-rendering."""

    slug: str = Field(..., description="URL-safe identifier — must be unique across plugins")
    name: str
    description: str
    icon: str = "🧩"  # single emoji for the UI card
    version: str = "0.0.0"
    capability: PluginCapability
    inputs: list[InputSpec] = Field(default_factory=list)
    # Hint for the UI: when present and capability=IMPORT, the result-card should
    # render a "Review unverified items →" link to this filter URL.
    review_link: str | None = None


@dataclass
class PluginContext:
    """Services available to plugins at runtime.

    The API injects concrete services (``AssetService``, ``ActorService``,
    ``RelationService``, ``RuleService``, ``EventService``) here. The SDK
    keeps the fields typed as ``Any | None`` so plugin authors don't have to
    depend on the whole API package — mock them in tests with stubs or
    ``unittest.mock``.

    ``event_service`` exposes ``log()`` so plugins can record custom audit
    events; it routes through the same webhook dispatcher as first-party
    writes.
    """

    asset_service: Any = field(default=None)
    actor_service: Any = field(default=None)
    relation_service: Any = field(default=None)
    rule_service: Any = field(default=None)
    event_service: Any = field(default=None)


# ===== Result types =====


class SummaryResult(BaseModel):
    """JSON-serialisable summary returned by IMPORT-style plugins."""

    title: str = ""
    counts: dict[str, int] = Field(default_factory=dict)
    samples: list[dict[str, Any]] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)


@dataclass
class DownloadResult:
    """File download returned by EXPORT-style plugins."""

    filename: str
    content_type: str
    body: bytes


PluginResult = SummaryResult | DownloadResult


# ===== Plugin protocol =====


class Plugin(Protocol):
    """Structural protocol that every plugin module must satisfy."""

    manifest: PluginManifest
    run: Callable[[PluginContext, dict[str, Any]], Awaitable[PluginResult]]
