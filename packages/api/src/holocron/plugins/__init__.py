"""Plugin framework — third-party packages register themselves via Python entry points
in the `holocron.plugins` group, and the API automatically exposes them under
`/api/v1/plugins/*`. The UI auto-renders a card per plugin from the manifest.

A plugin is any module that exports two attributes:

    manifest: PluginManifest
    run: Callable[[PluginContext, dict[str, Any]], Awaitable[PluginResult]]

Plugin packages declare themselves in their pyproject.toml:

    [project.entry-points."holocron.plugins"]
    excel-connector = "excel_connector.plugin"
"""

from holocron.plugins.base import (
    DownloadResult,
    InputSpec,
    PluginCapability,
    PluginContext,
    PluginManifest,
    PluginResult,
    SummaryResult,
)
from holocron.plugins.registry import PluginRegistry, get_registry

__all__ = [
    "DownloadResult",
    "InputSpec",
    "PluginCapability",
    "PluginContext",
    "PluginManifest",
    "PluginRegistry",
    "PluginResult",
    "SummaryResult",
    "get_registry",
]
