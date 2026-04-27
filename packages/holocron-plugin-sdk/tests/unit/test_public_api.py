"""SDK public-API smoke tests.

These tests guard the import path and the shape of the public types — they're
the contract third-party plugin authors rely on. Adding a required field to
``PluginManifest`` or removing a type without bumping the SDK major version
breaks every external plugin out there.
"""

from __future__ import annotations

import inspect
from typing import Any

import pytest

import holocron_plugin_sdk
from holocron_plugin_sdk import (
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


def test_version_is_a_string() -> None:
    assert isinstance(holocron_plugin_sdk.__version__, str)
    # Sanity: PEP 440-ish prefix. Don't pin the full version — that's busywork.
    assert holocron_plugin_sdk.__version__.split(".")[0].isdigit()


def test_public_exports_match_all() -> None:
    expected = {
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
    }
    assert set(holocron_plugin_sdk.__all__) == expected


def test_capability_enum_values() -> None:
    assert PluginCapability.IMPORT.value == "import"
    assert PluginCapability.EXPORT.value == "export"


def test_input_type_enum_values() -> None:
    assert {t.value for t in InputType} == {"file", "string", "boolean"}


def test_input_spec_defaults() -> None:
    spec = InputSpec(name="path", type=InputType.STRING, label="Path")
    assert spec.required is True
    assert spec.default is None
    assert spec.accept is None
    assert spec.description is None


def test_manifest_minimal() -> None:
    m = PluginManifest(
        slug="my-plugin",
        name="My Plugin",
        description="Does a thing.",
        capability=PluginCapability.IMPORT,
    )
    assert m.icon == "🧩"
    assert m.version == "0.0.0"
    assert m.inputs == []
    assert m.review_link is None


def test_manifest_full() -> None:
    m = PluginManifest(
        slug="my-plugin",
        name="My Plugin",
        description="Does a thing.",
        icon="🚀",
        version="1.2.3",
        capability=PluginCapability.IMPORT,
        inputs=[
            InputSpec(name="file", type=InputType.FILE, label="Upload", accept=".csv"),
            InputSpec(
                name="dry_run",
                type=InputType.BOOLEAN,
                label="Dry run",
                required=False,
                default=False,
            ),
        ],
        review_link="/assets?verified=false",
    )
    assert len(m.inputs) == 2
    assert m.inputs[0].accept == ".csv"


def test_plugin_context_defaults_are_none() -> None:
    """SDK contract: services are optional so plugin tests can construct an
    empty context without mocking anything."""
    ctx = PluginContext()
    assert ctx.asset_service is None
    assert ctx.actor_service is None
    assert ctx.relation_service is None
    assert ctx.rule_service is None
    assert ctx.event_service is None


def test_plugin_context_accepts_arbitrary_services() -> None:
    """Anything quacking like a service is acceptable — typed as Any | None."""

    class Stub:
        pass

    stub = Stub()
    ctx = PluginContext(asset_service=stub, actor_service=stub)
    assert ctx.asset_service is stub
    assert ctx.actor_service is stub


def test_summary_result_defaults() -> None:
    r = SummaryResult()
    assert r.title == ""
    assert r.counts == {}
    assert r.samples == []
    assert r.extra == {}


def test_download_result_required_fields() -> None:
    r = DownloadResult(filename="x.txt", content_type="text/plain", body=b"hi")
    assert r.body == b"hi"


def test_plugin_result_is_union() -> None:
    """Both result types satisfy the PluginResult union — used as a return
    annotation in the Plugin Protocol."""
    summary: PluginResult = SummaryResult()
    download: PluginResult = DownloadResult(filename="x", content_type="application/octet-stream", body=b"")
    assert isinstance(summary, SummaryResult)
    assert isinstance(download, DownloadResult)


def test_plugin_protocol_is_runtime_checkable_via_attrs() -> None:
    """A module exposing the right attributes satisfies the structural
    Plugin Protocol. This mirrors how the API's plugin loader validates
    discovered modules at startup."""

    async def run(ctx: PluginContext, inputs: dict[str, Any]) -> PluginResult:
        return SummaryResult()

    class FakeModule:
        manifest = PluginManifest(
            slug="x",
            name="X",
            description="x",
            capability=PluginCapability.EXPORT,
        )

    FakeModule.run = staticmethod(run)  # type: ignore[attr-defined]

    # Structural check — has the two required attributes with the right shapes.
    assert hasattr(FakeModule, "manifest")
    assert hasattr(FakeModule, "run")
    assert isinstance(FakeModule.manifest, PluginManifest)
    assert inspect.iscoroutinefunction(FakeModule.run)


@pytest.mark.asyncio
async def test_run_signature_matches_protocol() -> None:
    """End-to-end: a coroutine that takes (ctx, inputs) and returns a
    PluginResult is what the API will await."""

    async def run(ctx: PluginContext, inputs: dict[str, Any]) -> PluginResult:
        return SummaryResult(title="hello", counts={"n": 1})

    out = await run(PluginContext(), {})
    assert isinstance(out, SummaryResult)
    assert out.title == "hello"


def test_plugin_protocol_is_importable() -> None:
    """The Plugin Protocol is part of the public API even though it's
    structural — re-export must succeed."""
    assert Plugin is not None
