"""Holocron plugin entry point for pii-detector.

Read-only scanner: walks every asset's schema metadata, classifies fields
that look like PII, and returns a `SummaryResult` listing the candidates.

The plugin doesn't write anything — that's a deliberate v1 choice. The
user reviews the candidates in the result card and applies flags through
the existing schema-edit ⌘K commands. Auto-write is a v2 conversation
(needs a confidence threshold, an audit trail, and a way to undo).
"""

from __future__ import annotations

from typing import Any

from holocron.plugins.base import (
    PluginCapability,
    PluginContext,
    PluginManifest,
    SummaryResult,
)
from pii_detector import __version__
from pii_detector.detect import Finding, scan

PAGE_SIZE = 200
SAMPLE_LIMIT = 25  # keep the result-card readable; full list is in counts

manifest = PluginManifest(
    slug="pii-detector",
    name="PII Detector",
    description=(
        "Scan every schema field in the catalog for likely PII based on field "
        "name patterns (email, phone, SSN, biometric, name, address, …). "
        "Returns a summary of candidates with confidence tiers — no writes; "
        "use the schema-edit palette commands to apply the suggested flags."
    ),
    icon="🔒",
    version=__version__,
    capability=PluginCapability.IMPORT,
    inputs=[],
    review_link="/?has_description=false",  # not perfectly aligned but sends the user to a hygiene-style filter
)


async def run(ctx: PluginContext, _inputs: dict[str, Any]) -> SummaryResult:
    """Build a flat asset list, scan, return a SummaryResult."""
    assets = await _collect_assets(ctx)
    report = scan(assets)

    # Samples: prioritise high-confidence + currently-unflagged — those
    # are what the reviewer should look at first. Cap so the result card
    # stays scannable.
    new_high = [f for f in report.findings if f.confidence == "high" and not f.currently_flagged]
    new_medium = [f for f in report.findings if f.confidence == "medium" and not f.currently_flagged]
    sample_findings = (new_high + new_medium)[:SAMPLE_LIMIT]
    samples = [_finding_dict(f) for f in sample_findings]

    return SummaryResult(
        title=f"Scanned {report.fields_scanned} schema fields",
        counts={
            "fields_scanned": report.fields_scanned,
            "candidates": len(report.findings),
            "high_confidence": len(report.high_confidence),
            "medium_confidence": len(report.medium_confidence),
            "already_flagged": len(report.already_flagged),
            "new_candidates": len(report.new_candidates),
        },
        samples=samples,
        extra={
            "note": (
                "PII Detector is read-only — no fields were modified. Review the "
                "samples below and use ⌘K → 'Edit field → toggle PII' on the "
                "schema editor to apply each flag."
            )
        },
    )


async def _collect_assets(ctx: PluginContext) -> list[dict[str, Any]]:
    """Pull every asset through the service layer as plain dicts.

    The detection layer takes plain dicts — that decouples it from the
    snapshot models the other plugins use, and keeps the test suite
    runnable without importing pydantic at all.
    """
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = await ctx.asset_service.list(limit=PAGE_SIZE, offset=offset)
        out.extend(a.model_dump(mode="json") for a in page.items)
        offset += len(page.items)
        if not page.items or offset >= page.total:
            break
    return out


def _finding_dict(f: Finding) -> dict[str, Any]:
    """Compact dict form of a Finding — matches what the UI's plugin-run
    wizard renders in its sample list."""
    return {
        "asset": f.asset_name,
        "field": f.field_path,
        "confidence": f.confidence,
        "reason": f.reason,
        "currently_flagged": f.currently_flagged,
        "asset_uid": f.asset_uid,
    }
