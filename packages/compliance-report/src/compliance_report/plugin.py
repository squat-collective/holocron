"""Holocron plugin entry point for compliance-report.

Same shape as lineage-gap-audit: build a snapshot through the in-process
service layer, run the analyzers, render to xlsx, return as a download.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from compliance_report import __version__
from compliance_report.analysis import run_report
from compliance_report.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
    RuleRecord,
)
from compliance_report.workbook import write_compliance_xlsx
from holocron.plugins.base import (
    DownloadResult,
    PluginCapability,
    PluginContext,
    PluginManifest,
)

PAGE_SIZE = 200

manifest = PluginManifest(
    slug="compliance-report",
    name="Compliance Report",
    description=(
        "Export the catalog's governance state as an .xlsx workbook — coverage "
        "percentages, every applied rule with its enforcement tier, the PII "
        "field inventory, the ownership matrix, and the verification log. "
        "Designed for sharing with auditors and stakeholders."
    ),
    icon="📋",
    version=__version__,
    capability=PluginCapability.EXPORT,
    inputs=[],
)


async def run(ctx: PluginContext, _inputs: dict[str, Any]) -> DownloadResult:
    """Build snapshot → run analyzers → render xlsx → return as download."""
    snapshot = await _build_snapshot(ctx)
    report = run_report(snapshot)
    body = write_compliance_xlsx(report, generated_at=snapshot.fetched_at)
    filename = f"holocron-compliance-report-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.xlsx"
    return DownloadResult(
        filename=filename,
        content_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        body=body,
    )


async def _build_snapshot(ctx: PluginContext) -> CatalogSnapshot:
    """Walk every paginated list into an in-memory snapshot."""
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

    rules: list[RuleRecord] = []
    offset = 0
    while True:
        page = await ctx.rule_service.list(limit=PAGE_SIZE, offset=offset)
        rules.extend(RuleRecord.model_validate(r.model_dump(mode="json")) for r in page.items)
        offset += len(page.items)
        if not page.items or offset >= page.total:
            break

    return CatalogSnapshot(
        fetched_at=datetime.now(UTC),
        assets=assets,
        actors=actors,
        relations=relations,
        rules=rules,
    )
