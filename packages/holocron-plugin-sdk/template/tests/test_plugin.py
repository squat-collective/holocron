"""Tests for the hello-world plugin.

Mirrors the shape of every Holocron plugin's test suite: build a stub
``PluginContext`` (no real API needed), call ``run()`` directly, assert on the
result.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from holocron_plugin_sdk import (
    DownloadResult,
    PluginCapability,
    PluginContext,
)
from my_plugin.plugin import manifest, run


def test_manifest_shape() -> None:
    assert manifest.slug == "my-plugin"
    assert manifest.capability == PluginCapability.EXPORT
    assert manifest.inputs == []


@pytest.mark.asyncio
async def test_run_with_no_services_returns_zero_count() -> None:
    """Without services injected, the plugin still runs — useful baseline."""
    result = await run(PluginContext(), {})
    assert isinstance(result, DownloadResult)
    assert result.filename == "hello.txt"
    assert b"0 assets" in result.body


@pytest.mark.asyncio
async def test_run_with_stub_asset_service_reports_count() -> None:
    """Stub the asset service to prove the plugin reads from the context.

    This is the pattern for any plugin that talks to the catalog: build a
    minimal stub, inject it, assert on the output.
    """

    @dataclass
    class _Page:
        total: int = 42

    class _StubAssetService:
        async def list(self, *, limit: int, offset: int) -> _Page:
            return _Page()

    ctx = PluginContext(asset_service=_StubAssetService())
    result = await run(ctx, {})
    assert isinstance(result, DownloadResult)
    assert b"42 assets" in result.body
    assert result.content_type == "text/plain"
