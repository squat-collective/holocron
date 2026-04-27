"""Holocron plugin entry point for data-dictionary-markdown.

Mirrors the excel-exporter shape: paginate the catalog through the
in-process service layer, hand it to the renderer, return the resulting
zip as a `DownloadResult`. The API streams the bytes back to the browser
as a regular file download.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from data_dictionary_markdown import __version__
from data_dictionary_markdown.bundle import write_dictionary_zip
from data_dictionary_markdown.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
)
from holocron_plugin_sdk import (
    DownloadResult,
    PluginCapability,
    PluginContext,
    PluginManifest,
)

PAGE_SIZE = 200

manifest = PluginManifest(
    slug="data-dictionary-markdown",
    name="Data Dictionary (Markdown)",
    description=(
        "Download the catalog as a zip of Markdown pages — one per asset and "
        "actor, plus an index README. Useful for git-friendly data docs, "
        "static-site publishing, or feeding an LLM with the catalog as context."
    ),
    icon="📘",
    version=__version__,
    capability=PluginCapability.EXPORT,
    inputs=[],
)


async def run(ctx: PluginContext, _inputs: dict[str, Any]) -> DownloadResult:
    """Build a snapshot, render to zip, return as a download."""
    snapshot = await _build_snapshot(ctx)
    body = write_dictionary_zip(snapshot)
    filename = f"holocron-data-dictionary-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.zip"
    return DownloadResult(
        filename=filename,
        content_type="application/zip",
        body=body,
    )


async def _build_snapshot(ctx: PluginContext) -> CatalogSnapshot:
    """Walk the catalog through the service layer, paginated. Same shape as
    excel-exporter's `_build_snapshot` — kept duplicated rather than shared
    so the two plugins stay independently versionable."""
    assets: list[AssetRecord] = []
    offset = 0
    while True:
        page = await ctx.asset_service.list(limit=PAGE_SIZE, offset=offset)
        assets.extend(AssetRecord.model_validate(a.model_dump(mode="json")) for a in page.items)
        offset += len(page.items)
        if not page.items or offset >= page.total:
            break

    actors: list[ActorRecord] = []
    offset = 0
    while True:
        page = await ctx.actor_service.list(limit=PAGE_SIZE, offset=offset)
        actors.extend(ActorRecord.model_validate(a.model_dump(mode="json")) for a in page.items)
        offset += len(page.items)
        if not page.items or offset >= page.total:
            break

    relations: list[RelationRecord] = []
    offset = 0
    while True:
        page = await ctx.relation_service.list(limit=PAGE_SIZE, offset=offset)
        relations.extend(
            RelationRecord.model_validate(r.model_dump(mode="json")) for r in page.items
        )
        offset += len(page.items)
        if not page.items or offset >= page.total:
            break

    return CatalogSnapshot(
        fetched_at=datetime.now(UTC),
        assets=assets,
        actors=actors,
        relations=relations,
    )
