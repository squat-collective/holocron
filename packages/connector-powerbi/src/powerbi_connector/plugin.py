"""Holocron plugin entry point for powerbi-connector.

Takes a .pbix upload, opens the zip, parses the Layout JSON for the
tables and visuals it references, and upserts a `report` asset for the
file plus one `dataset` asset per referenced table — wired together with
`uses` relations.
"""

from __future__ import annotations

from typing import Any

from holocron.plugins.base import (
    InputSpec,
    InputType,
    PluginCapability,
    PluginContext,
    PluginManifest,
    SummaryResult,
)
from powerbi_connector import DISCOVERED_BY, __version__
from powerbi_connector.extract import PbixOpenError, open_pbix
from powerbi_connector.mapping import AssetPayload, RelationPayload, map_scan
from powerbi_connector.parse import parse_scan

manifest = PluginManifest(
    slug="powerbi-connector",
    name="Power BI Sync",
    description=(
        "Upload a .pbix report. The connector extracts the tables and columns "
        "referenced from each visual and creates a Holocron `report` asset for "
        "the file plus a `dataset` asset per referenced table, wired together "
        "with `uses` relations. v0.1 reads the Layout JSON only — the "
        "proprietary DataModel isn't parsed."
    ),
    icon="📊",
    version=__version__,
    capability=PluginCapability.IMPORT,
    inputs=[
        InputSpec(
            name="file",
            type=InputType.FILE,
            label="Power BI report",
            description=".pbix file (max ~50 MB)",
            accept=".pbix",
            required=True,
        ),
    ],
    review_link="/admin/assets",
)


async def run(ctx: PluginContext, inputs: dict[str, Any]) -> SummaryResult:
    """Open .pbix → parse Layout → upsert assets + relations."""
    upload = inputs["file"]
    if not upload.filename or not upload.filename.lower().endswith(".pbix"):
        raise ValueError("Only .pbix files are supported")

    body = await upload.read()
    try:
        opened = open_pbix(body)
    except PbixOpenError as exc:
        # Bubble up as ValueError so the plugin route returns 422 with
        # the message instead of a generic 500.
        raise ValueError(str(exc)) from exc

    scan = parse_scan(
        file_name=upload.filename,
        layout=opened["layout"],
        artefacts=opened["artefacts"],
    )

    assets, relations = map_scan(scan)
    push = await _push(assets, relations, ctx)

    return SummaryResult(
        title=f"Scanned {upload.filename}",
        counts={
            "pages": scan.page_count,
            "visuals": scan.visual_count,
            "tables_referenced": len(scan.tables),
            **push["counts"],
        },
        samples=push["samples"],
        extra={
            "file_name": upload.filename,
            "layout_present": scan.layout_present,
            "layout_version": scan.layout_version,
            "artefacts": scan.artefacts,
        },
    )


# ---------- service-layer upserts ----------


async def _push(
    assets: list[AssetPayload],
    relations: list[RelationPayload],
    ctx: PluginContext,
) -> dict[str, Any]:
    """Upsert assets first, then create relations only for surviving
    pairs. Mirrors csv-connector's get-then-create-or-update pattern."""
    counts = {
        "assets_created": 0,
        "assets_updated": 0,
        "relations_created": 0,
        "relations_skipped_existing": 0,
    }
    samples: list[dict[str, Any]] = []

    for asset in assets:
        created, response = await _upsert_asset(asset, ctx)
        if created:
            counts["assets_created"] += 1
            if len(samples) < 5:
                samples.append(response.model_dump(mode="json"))
        else:
            counts["assets_updated"] += 1

    for relation in relations:
        created = await _create_relation_if_missing(relation, ctx)
        if created:
            counts["relations_created"] += 1
        else:
            counts["relations_skipped_existing"] += 1

    return {"counts": counts, "samples": samples}


async def _upsert_asset(
    payload: AssetPayload, ctx: PluginContext
) -> tuple[bool, Any]:
    from holocron.api.schemas.assets import AssetCreate, AssetType, AssetUpdate
    from holocron.core.exceptions import NotFoundError

    try:
        await ctx.asset_service.get(payload.uid)
        update = AssetUpdate(
            name=payload.name,
            description=payload.description,
            location=payload.location,
            metadata=payload.metadata,
            discovered_by=DISCOVERED_BY,
        )
        return False, await ctx.asset_service.update(payload.uid, update)
    except NotFoundError:
        pass

    create = AssetCreate(
        uid=payload.uid,
        type=AssetType(payload.type),
        name=payload.name,
        description=payload.description,
        location=payload.location,
        metadata=payload.metadata,
        verified=False,
        discovered_by=DISCOVERED_BY,
    )
    return True, await ctx.asset_service.create(create)


async def _create_relation_if_missing(
    payload: RelationPayload, ctx: PluginContext
) -> bool:
    from holocron.api.schemas.relations import RelationCreate, RelationType
    from holocron.core.exceptions import DuplicateError, NotFoundError

    try:
        await ctx.relation_service.get(payload.uid)
        return False
    except NotFoundError:
        pass

    try:
        await ctx.relation_service.create(
            RelationCreate(
                uid=payload.uid,
                from_uid=payload.from_uid,
                to_uid=payload.to_uid,
                type=RelationType(payload.type),
                properties=payload.properties,
                verified=False,
                discovered_by=DISCOVERED_BY,
            )
        )
        return True
    except (DuplicateError, NotFoundError):
        return False
