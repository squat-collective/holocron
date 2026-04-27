"""Holocron plugin entry point for excel-connector.

Exposes a manifest + an async run() that the API discovers via the
`holocron.plugins` entry-point group (see pyproject.toml).
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any

from excel_connector import DISCOVERED_BY, __version__, scan_workbook
from excel_connector.mapping import (
    ActorPayload,
    AssetPayload,
    MappedScan,
    RelationPayload,
    map_scan_to_holocron,
)

# Pydantic + plugin types live in the API — but we only import them at runtime when
# loaded inside the API process (entry_points discovery). Local CLI use doesn't need them.
from holocron.plugins.base import (
    InputSpec,
    InputType,
    PluginCapability,
    PluginContext,
    PluginManifest,
    SummaryResult,
)

if TYPE_CHECKING:
    from holocron.api.schemas.actors import ActorCreate, ActorUpdate
    from holocron.api.schemas.assets import AssetCreate, AssetUpdate
    from holocron.api.schemas.relations import RelationCreate

manifest = PluginManifest(
    slug="excel-connector",
    name="Excel Connector",
    description=(
        "Drop in a .xlsx file. Extracts sheets, tables, columns, formula-based "
        "lineage, and owners from the file's metadata. Discovered items land as "
        "unverified so you can confirm them in the catalog."
    ),
    icon="📊",
    version=__version__,
    capability=PluginCapability.IMPORT,
    inputs=[
        InputSpec(
            name="file",
            type=InputType.FILE,
            label="Excel file",
            description="A .xlsx, .xlsm, or .xltx file",
            accept=".xlsx,.xlsm,.xltx",
            required=True,
        ),
    ],
    review_link="/admin/assets",
)


async def run(ctx: PluginContext, inputs: dict[str, Any]) -> SummaryResult:
    """Scan an uploaded Excel file and upsert all discoveries into Holocron."""
    upload = inputs["file"]
    if not upload.filename or not upload.filename.lower().endswith((".xlsx", ".xlsm", ".xltx")):
        raise ValueError("Only .xlsx/.xlsm/.xltx files are supported")

    suffix = Path(upload.filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(await upload.read())

    try:
        result = scan_workbook(tmp_path)
        # Anchor UIDs to the original filename (idempotent re-uploads).
        result.file_name = upload.filename
        result.file_path = f"upload://{upload.filename}"
        mapped = map_scan_to_holocron(result)
    finally:
        tmp_path.unlink(missing_ok=True)

    push = await _push_mapped(mapped, ctx)

    workbook_uid = mapped.assets[0].uid if mapped.assets else ""
    total_formulas = sum(len(t.formulas) for s in result.sheets for t in s.tables)
    total_tables = sum(len(s.tables) for s in result.sheets)

    return SummaryResult(
        title=f"Scanned {upload.filename}",
        counts={
            "sheets": len(result.sheets),
            "tables": total_tables,
            "formulas": total_formulas,
            "external_links": len(result.external_links),
            "actors_discovered": len(result.actors),
            **push["counts"],
        },
        samples=push["samples"],
        extra={"workbook_uid": workbook_uid, "file_name": upload.filename},
    )


# ===== Service-layer upsert helpers (kept private to this plugin) =====


async def _push_mapped(mapped: MappedScan, ctx: PluginContext) -> dict[str, Any]:
    counts = {
        "assets_created": 0,
        "assets_updated": 0,
        "actors_created": 0,
        "actors_updated": 0,
        "relations_created": 0,
        "relations_skipped_existing": 0,
    }
    samples: list[dict[str, Any]] = []

    for payload in mapped.assets:
        created, response = await _upsert_asset(payload, ctx)
        if created:
            counts["assets_created"] += 1
            if len(samples) < 5:
                samples.append(response.model_dump(mode="json"))
        else:
            counts["assets_updated"] += 1

    for payload in mapped.actors:
        created, _ = await _upsert_actor(payload, ctx)
        if created:
            counts["actors_created"] += 1
        else:
            counts["actors_updated"] += 1

    for payload in mapped.relations:
        created = await _create_relation_if_missing(payload, ctx)
        if created:
            counts["relations_created"] += 1
        else:
            counts["relations_skipped_existing"] += 1

    return {"counts": counts, "samples": samples}


async def _upsert_asset(payload: AssetPayload, ctx: PluginContext) -> tuple[bool, Any]:
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


async def _upsert_actor(payload: ActorPayload, ctx: PluginContext) -> tuple[bool, Any]:
    from holocron.api.schemas.actors import ActorCreate, ActorType, ActorUpdate
    from holocron.core.exceptions import NotFoundError

    try:
        await ctx.actor_service.get(payload.uid)
        update = ActorUpdate(
            name=payload.name,
            email=payload.email,
            metadata=payload.metadata,
            discovered_by=DISCOVERED_BY,
        )
        return False, await ctx.actor_service.update(payload.uid, update)
    except NotFoundError:
        pass

    create = ActorCreate(
        uid=payload.uid,
        type=ActorType(payload.type),
        name=payload.name,
        email=payload.email,
        metadata=payload.metadata,
        verified=False,
        discovered_by=DISCOVERED_BY,
    )
    return True, await ctx.actor_service.create(create)


async def _create_relation_if_missing(payload: RelationPayload, ctx: PluginContext) -> bool:
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
