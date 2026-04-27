"""Map a `PbixScan` into Holocron payloads.

Output:

  - **One report asset** per .pbix — the file itself becomes a Holocron
    `report` with metadata listing the artefacts it contains, the page +
    visual counts, and the parsed Layout version.
  - **One dataset asset per referenced table** — table names extracted
    from visual queries become datasets carrying the columns we saw
    referenced (under `metadata.schema`). Re-running the connector
    against the same file upserts in place via deterministic UIDs.
  - **One `uses` relation per (report, table) pair** — the report uses
    each referenced table.

We can't (yet) tell which data source each table came from, so the
table assets carry no `location`. A future version that wires
`Connections` into the mapping can fill that in.
"""

from __future__ import annotations

import hashlib
from typing import Any

from powerbi_connector.models import (
    AssetPayload,
    PbixScan,
    PbixTableRef,
    RelationPayload,
)


def _uid(*parts: str) -> str:
    seed = ":".join(parts)
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:32]


def _report_uid(file_name: str) -> str:
    return _uid("powerbi", "report", file_name)


def _table_uid(file_name: str, table_name: str) -> str:
    # Scope the table uid to the file. Two reports referencing a
    # similarly-named local "Sales" table shouldn't collide — they
    # might be different tables semantically. If callers want cross-
    # report dedup later, they can rerun the connector with a stable
    # `file_name` (e.g. a logical name) instead of the upload's
    # filename.
    return _uid("powerbi", "table", file_name, table_name)


def _relation_uid(report_uid: str, table_uid: str) -> str:
    return _uid("powerbi", "uses", report_uid, table_uid)


def _table_schema_node(table: PbixTableRef) -> dict[str, Any]:
    """One top-level container with the columns we saw referenced."""
    return {
        "id": f"table-{table.name}",
        "nodeType": "container",
        "containerType": "table",
        "name": table.name,
        "children": [
            {
                "id": f"col-{col}",
                "nodeType": "field",
                "name": col,
                # We don't know the underlying type — the report only
                # tells us which columns it consumes, not their schema.
                # Leave dataType absent so the UI shows "—" rather than
                # a misleading guess.
            }
            for col in table.columns
            if col != "(measure)"
        ],
    }


def map_scan(scan: PbixScan) -> tuple[list[AssetPayload], list[RelationPayload]]:
    """Build (assets, relations) from a scan."""
    report_uid = _report_uid(scan.file_name)
    report_asset = AssetPayload(
        uid=report_uid,
        type="report",
        name=scan.file_name,
        location=f"upload://{scan.file_name}",
        metadata={
            "tool": "powerbi",
            "format": "pbix",
            "page_count": scan.page_count,
            "visual_count": scan.visual_count,
            "table_count": len(scan.tables),
            "layout_version": scan.layout_version,
            "powerbi": {
                "artefacts": scan.artefacts,
                "tables_referenced": [t.name for t in scan.tables],
            },
        },
    )

    table_assets: list[AssetPayload] = []
    relations: list[RelationPayload] = []
    for table in scan.tables:
        t_uid = _table_uid(scan.file_name, table.name)
        table_assets.append(
            AssetPayload(
                uid=t_uid,
                type="dataset",
                name=table.name,
                metadata={
                    "tool": "powerbi",
                    "format": "table",
                    "schema": [_table_schema_node(table)],
                    "powerbi": {
                        "report_file": scan.file_name,
                        "columns_referenced": list(table.columns),
                    },
                },
            )
        )
        relations.append(
            RelationPayload(
                uid=_relation_uid(report_uid, t_uid),
                from_uid=report_uid,
                to_uid=t_uid,
                type="uses",
                properties={"discovered_in": scan.file_name},
            )
        )

    return [report_asset, *table_assets], relations
