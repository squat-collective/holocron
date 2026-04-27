"""Holocron plugin entry point.

The Holocron API auto-discovers this module via the
``holocron.plugins`` entry point declared in ``pyproject.toml``.
It must expose two attributes:

- ``manifest`` — a :class:`PluginManifest` describing the plugin to the UI
- ``run`` — an async function ``(ctx, inputs) -> PluginResult``
"""

from __future__ import annotations

from typing import Any

from holocron_plugin_sdk import (
    DownloadResult,
    PluginCapability,
    PluginContext,
    PluginManifest,
)

from my_plugin import __version__

manifest = PluginManifest(
    slug="my-plugin",
    name="My Plugin",
    description="Hello-world example — exports a tiny text file with the asset count.",
    icon="👋",
    version=__version__,
    capability=PluginCapability.EXPORT,
    inputs=[],
)


async def run(ctx: PluginContext, _inputs: dict[str, Any]) -> DownloadResult:
    """Return a plain-text greeting + the catalog asset count.

    Replace this body with your own logic. The signature must stay
    ``(ctx: PluginContext, inputs: dict[str, Any]) -> PluginResult`` so the
    Holocron API can call it.
    """
    asset_count = 0
    if ctx.asset_service is not None:
        page = await ctx.asset_service.list(limit=1, offset=0)
        asset_count = page.total

    body = f"Hello from my-plugin! The catalog currently has {asset_count} assets.\n"
    return DownloadResult(
        filename="hello.txt",
        content_type="text/plain",
        body=body.encode("utf-8"),
    )
