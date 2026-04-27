"""Holocron plugin entry point for excel-exporter.

Exposes a manifest + async run() returning a DownloadResult — the API
streams the workbook bytes back to the browser as a file download.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from excel_exporter import __version__
from excel_exporter.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
)
from excel_exporter.workbook import write_workbook_to_bytes
from holocron.plugins.base import (
    DownloadResult,
    PluginCapability,
    PluginContext,
    PluginManifest,
)

manifest = PluginManifest(
    slug="excel-exporter",
    name="Excel Exporter",
    description=(
        "Download the full catalog (assets, actors, relations, schemas, lineage) "
        "as a single .xlsx file. Useful for offline review, sharing with non-"
        "technical stakeholders, or audit trails."
    ),
    icon="📤",
    version=__version__,
    capability=PluginCapability.EXPORT,
    inputs=[],  # No user inputs in v0.1
)

PAGE_SIZE = 200


async def run(ctx: PluginContext, _inputs: dict[str, Any]) -> DownloadResult:
    """Build a CatalogSnapshot via the in-process service layer, write it to xlsx,
    return as a DownloadResult."""
    snapshot = await _build_snapshot(ctx)
    body = write_workbook_to_bytes(snapshot)
    filename = f"holocron-catalog-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.xlsx"
    return DownloadResult(
        filename=filename,
        content_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        body=body,
    )


async def _build_snapshot(ctx: PluginContext) -> CatalogSnapshot:
    """Walk all paginated lists into an in-memory snapshot."""
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
        api_url="in-process",
        fetched_at=datetime.now(UTC),
        assets=assets,
        actors=actors,
        relations=relations,
    )
