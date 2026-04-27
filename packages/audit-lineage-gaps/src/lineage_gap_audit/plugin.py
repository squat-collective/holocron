"""Holocron plugin entry point for lineage-gap-audit.

Same shape as excel-exporter: build a snapshot through the in-process
service layer (now including rules), run the analyzers, render the
findings to xlsx, and return the workbook as a `DownloadResult`. The API
streams the bytes back to the browser as a download.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from holocron.plugins.base import (
    DownloadResult,
    PluginCapability,
    PluginContext,
    PluginManifest,
)
from lineage_gap_audit import __version__
from lineage_gap_audit.analysis import run_audit
from lineage_gap_audit.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
    RuleRecord,
)
from lineage_gap_audit.workbook import write_audit_xlsx

PAGE_SIZE = 200

manifest = PluginManifest(
    slug="lineage-gap-audit",
    name="Lineage Gap Audit",
    description=(
        "Scan the catalog for hygiene gaps — assets with no owner, no lineage, no "
        "description; rules with no applied target; entities still flagged "
        "unverified — and download the findings as an .xlsx workbook."
    ),
    icon="🔎",
    version=__version__,
    capability=PluginCapability.EXPORT,
    inputs=[],
)


async def run(ctx: PluginContext, _inputs: dict[str, Any]) -> DownloadResult:
    """Build snapshot → run audit → render xlsx → return as download."""
    snapshot = await _build_snapshot(ctx)
    report = run_audit(snapshot)
    body = write_audit_xlsx(report, generated_at=snapshot.fetched_at)
    filename = f"holocron-lineage-gap-audit-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.xlsx"
    return DownloadResult(
        filename=filename,
        content_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        body=body,
    )


async def _build_snapshot(ctx: PluginContext) -> CatalogSnapshot:
    """Walk every paginated list into an in-memory snapshot.

    The four loops are intentionally explicit rather than abstracted —
    each service has slightly different list signatures and pagination
    semantics, so a single generic helper would just push the special
    cases somewhere else.
    """
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
