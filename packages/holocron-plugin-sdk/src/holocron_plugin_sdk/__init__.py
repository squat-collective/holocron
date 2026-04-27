"""Public plugin contract for Holocron.

Plugin authors should import everything from this top-level module.
"""

from __future__ import annotations

from holocron_plugin_sdk.base import (
    DownloadResult,
    InputSpec,
    InputType,
    Plugin,
    PluginCapability,
    PluginContext,
    PluginManifest,
    PluginResult,
    SummaryResult,
)

__version__ = "0.1.0"

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
    "__version__",
]
