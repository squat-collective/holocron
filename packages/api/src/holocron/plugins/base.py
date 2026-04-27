"""Plugin protocol, manifest, context, and result types.

The Pydantic schemas, enums, and the structural ``Plugin`` Protocol are owned
by ``holocron-plugin-sdk`` and re-exported here for backward compatibility
with first-party plugins that import from ``holocron.plugins.base``. New
plugins should import directly from ``holocron_plugin_sdk``.

``PluginContext`` is intentionally **not** re-exported: the API uses concrete
service types (``AssetService``, …) while the SDK exposes ``Any | None`` so
external plugin authors don't pull the API in. Plugins access context fields
by name, so the two dataclasses are duck-type compatible at runtime.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from holocron_plugin_sdk import (
    DownloadResult,
    InputSpec,
    InputType,
    Plugin,
    PluginCapability,
    PluginManifest,
    PluginResult,
    SummaryResult,
)

if TYPE_CHECKING:
    from holocron.core.services.actor_service import ActorService
    from holocron.core.services.asset_service import AssetService
    from holocron.core.services.event_service import EventService
    from holocron.core.services.relation_service import RelationService
    from holocron.core.services.rule_service import RuleService


@dataclass
class PluginContext:
    """Services available to plugins at runtime — inject via FastAPI deps in routes.py.

    Field names mirror :class:`holocron_plugin_sdk.PluginContext` so plugins
    written against the SDK work unchanged when this concrete instance is
    passed in at runtime. ``event_service`` is the dispatching event repo —
    plugins that call ``await ctx.event_service.log(...)`` get webhook
    fan-out for free.
    """

    asset_service: AssetService
    actor_service: ActorService
    relation_service: RelationService
    rule_service: RuleService
    event_service: EventService


__all__ = [
    "DownloadResult",
    "InputSpec",
    "InputType",
    "Plugin",
    "PluginCapability",
    "PluginContext",
    "PluginManifest",
    "PluginResult",
    "SummaryResult",
]
