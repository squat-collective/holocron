"""Map a `PgScan` into Holocron asset payloads.

One Holocron `dataset` asset per PG table. The schema metadata gets a
single top-level container (the table) with one field child per column.
UIDs are deterministic from `(host, port, database, schema, table)` so
re-running the connector against the same DB upserts in place rather
than duplicating.
"""

from __future__ import annotations

import hashlib
from typing import Any

from postgres_connector.models import AssetPayload, PgScan, PgTable


def _asset_uid(host: str, port: int, database: str, schema: str, table: str) -> str:
    """Deterministic 32-char UID for a PG table.

    Mirrors the csv-connector's hashing convention so a future cross-
    connector tool can recognise PG-origin assets at a glance.
    """
    seed = f"postgres:dataset:{host}:{port}/{database}/{schema}.{table}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:32]


def _location(host: str, port: int, database: str, schema: str, table: str) -> str:
    """A pseudo-URL that's unambiguous as a location string and readable
    when shown in the UI. Not a real connection string — passwords stay
    out of the catalog."""
    return f"postgresql://{host}:{port}/{database}/{schema}.{table}"


def _schema_node(table: PgTable) -> dict[str, Any]:
    """Convert one PG table into a Holocron schema container node."""
    children: list[dict[str, Any]] = []
    for col in table.columns:
        node: dict[str, Any] = {
            "id": f"col-{col.name}",
            "nodeType": "field",
            "name": col.name,
            "dataType": col.data_type,
        }
        if col.description:
            node["description"] = col.description
        if not col.is_nullable:
            # Surface required-ness in the schema metadata. The UI's
            # schema view doesn't read this yet, but it's a structured
            # field downstream tools can pick up.
            node["required"] = True
        children.append(node)

    container: dict[str, Any] = {
        "id": f"table-{table.name}",
        "nodeType": "container",
        "containerType": "table",
        "name": table.qualified_name,
        "children": children,
    }
    if table.description:
        container["description"] = table.description
    return container


def map_scan_to_assets(scan: PgScan) -> list[AssetPayload]:
    """Produce one AssetPayload per PG table in the scan.

    Tables go through unchanged; views are also included (typed
    `dataset` + a metadata flag — Holocron doesn't have a separate "view"
    asset type and conflating with `dataset` is fine for cataloguing).
    Empty schemas (no columns) still produce an asset — useful when a
    table was just created and you want it in the catalog before you
    populate it.
    """
    out: list[AssetPayload] = []
    for table in scan.tables:
        uid = _asset_uid(scan.host, scan.port, scan.database, table.schema_name, table.name)
        location = _location(scan.host, scan.port, scan.database, table.schema_name, table.name)

        metadata: dict[str, Any] = {
            "tool": "postgresql",
            "storage": "postgresql",
            "format": "table" if table.table_type == "BASE TABLE" else "view",
            "row_count": None,  # would need a COUNT(*) — skip for v0.1
            "schema": [_schema_node(table)],
            "postgres": {
                "host": scan.host,
                "port": scan.port,
                "database": scan.database,
                "schema": table.schema_name,
                "table": table.name,
                "table_type": table.table_type,
            },
        }

        out.append(
            AssetPayload(
                uid=uid,
                type="dataset",
                name=table.qualified_name,
                description=table.description,
                location=location,
                metadata=metadata,
            )
        )
    return out
