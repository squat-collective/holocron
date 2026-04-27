"""Holocron plugin entry point for postgres-connector.

Connects to a user-supplied PG instance, introspects the requested
schema, and upserts one Asset per table into Holocron. Discovered
items land verified=False so a human reviews before they're trusted.
"""

from __future__ import annotations

from typing import Any

import psycopg

from holocron.plugins.base import (
    InputSpec,
    InputType,
    PluginCapability,
    PluginContext,
    PluginManifest,
    SummaryResult,
)
from postgres_connector import DISCOVERED_BY, __version__
from postgres_connector.introspect import introspect
from postgres_connector.mapping import AssetPayload, map_scan_to_assets

manifest = PluginManifest(
    slug="postgres-connector",
    name="PostgreSQL Sync",
    description=(
        "Connect to a PostgreSQL instance and import every table in the chosen "
        "schema as a Holocron dataset (with column-level schema metadata). "
        "Discovered items land unverified — confirm them through the catalog."
    ),
    icon="🐘",
    version=__version__,
    capability=PluginCapability.IMPORT,
    inputs=[
        InputSpec(name="host", type=InputType.STRING, label="Host", description="Hostname or IP", required=True),
        InputSpec(name="port", type=InputType.STRING, label="Port", description="Default 5432", required=False, default="5432"),
        InputSpec(name="database", type=InputType.STRING, label="Database", required=True),
        InputSpec(name="user", type=InputType.STRING, label="User", required=True),
        InputSpec(
            name="password",
            type=InputType.STRING,
            label="Password",
            description="Used only for this run — not persisted.",
            required=True,
        ),
        InputSpec(
            name="schema",
            type=InputType.STRING,
            label="Schema",
            description="Default 'public'. Internal PG schemas are excluded.",
            required=False,
            default="public",
        ),
    ],
    review_link="/admin/assets",
)


async def run(ctx: PluginContext, inputs: dict[str, Any]) -> SummaryResult:
    """Connect → introspect → upsert."""
    host = str(inputs.get("host") or "").strip()
    database = str(inputs.get("database") or "").strip()
    user = str(inputs.get("user") or "").strip()
    password = str(inputs.get("password") or "")
    schema = str(inputs.get("schema") or "public").strip() or "public"
    port_raw = str(inputs.get("port") or "5432").strip() or "5432"
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError(f"Invalid port: {port_raw!r}") from exc

    if not host or not database or not user:
        raise ValueError("host, database, and user are required")

    # Open one connection for the whole run. `connect_timeout` keeps
    # bad hostnames from hanging the API request indefinitely.
    conn_str = f"host={host} port={port} dbname={database} user={user} password={password} connect_timeout=10"
    try:
        async with await psycopg.AsyncConnection.connect(conn_str) as conn:
            scan = await introspect(
                conn, host=host, port=port, database=database, schema=schema
            )
    except psycopg.OperationalError as exc:
        # Wrap so the password (if echoed back in the underlying error)
        # never leaks into the plugin response.
        raise ValueError(f"Failed to connect to PostgreSQL: {_redact(str(exc), password)}") from exc

    payloads = map_scan_to_assets(scan)
    push = await _push_payloads(payloads, ctx)

    return SummaryResult(
        title=f"Synced {schema} from {host}/{database}",
        counts={
            "tables_found": len(scan.tables),
            "columns_total": sum(len(t.columns) for t in scan.tables),
            **push["counts"],
        },
        samples=push["samples"],
        extra={
            "host": host,
            "port": port,
            "database": database,
            "schema": schema,
        },
    )


# ---------- service-layer upsert ----------


async def _push_payloads(
    payloads: list[AssetPayload], ctx: PluginContext
) -> dict[str, Any]:
    """Upsert every payload via the asset service. Mirrors csv-connector's
    pattern: get-by-uid → update if found, create otherwise."""
    counts = {"assets_created": 0, "assets_updated": 0}
    samples: list[dict[str, Any]] = []
    for payload in payloads:
        created, response = await _upsert_asset(payload, ctx)
        if created:
            counts["assets_created"] += 1
            if len(samples) < 5:
                samples.append(response.model_dump(mode="json"))
        else:
            counts["assets_updated"] += 1
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


def _redact(message: str, secret: str) -> str:
    """Replace any literal occurrence of the password in a string with
    `***`. Defensive — psycopg occasionally echoes the connection string
    in error text, and we don't want a 500 page leaking creds."""
    if not secret:
        return message
    return message.replace(secret, "***")
