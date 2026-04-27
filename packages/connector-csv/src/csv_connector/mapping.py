"""Map a ScanResult into Holocron API payloads with deterministic UIDs.

Schema-tree shape for CSV is simpler than Excel — one Dataset asset with a
single ``table`` container at the top of ``metadata.schema``:

    [
        { nodeType: "container", containerType: "table", name: "<basename>",
          children: [
              { nodeType: "field", dataType: "integer", name: "id" },
              { nodeType: "field", dataType: "string",  name: "name" },
          ]
        }
    ]

No sheet wrapper — CSV is flat.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

from csv_connector.models import (
    ColumnType,
    DetectedActor,
    DetectedColumn,
    ScanResult,
)


def _uid(*parts: str) -> str:
    """Deterministic 32-char hex UID derived from parts (sha256 prefix)."""
    return hashlib.sha256(":".join(parts).encode()).hexdigest()[:32]


def dataset_uid(file_path: str) -> str:
    return _uid("csv:dataset", file_path)


def actor_uid(actor: DetectedActor) -> str:
    """Shared with excel-connector on purpose: the same Person should resolve
    to the same Holocron entity whether discovered from CSV or XLSX."""
    key = (actor.email or actor.name).lower()
    return _uid("excel:actor:person", key)


def relation_uid(source_uid: str, rel_type: str, target_uid: str) -> str:
    return _uid("csv:relation", source_uid, rel_type, target_uid)


def _schema_node_id(*parts: str) -> str:
    """Stable id for a SchemaNode (used as React key in the UI)."""
    return _uid("csv:schema", *parts)[:9]


# Map our ColumnType enum to the UI's dataType vocabulary
# (packages/ui/.../schema-editor.tsx defines: string, integer, float, boolean,
# date, datetime, array, object, measure, dimension, calculated, other).
_DATA_TYPE_MAP: dict[ColumnType, str] = {
    ColumnType.STRING: "string",
    ColumnType.INTEGER: "integer",
    ColumnType.FLOAT: "float",
    ColumnType.BOOLEAN: "boolean",
    ColumnType.DATE: "date",
    ColumnType.DATETIME: "datetime",
    ColumnType.EMPTY: "other",
    ColumnType.MIXED: "other",
}


@dataclass
class AssetPayload:
    """One Holocron asset that should exist after a scan."""

    uid: str
    type: str  # "system" | "dataset" | "report" | "process"
    name: str
    description: str | None
    location: str | None
    metadata: dict[str, Any]


@dataclass
class ActorPayload:
    """One Holocron actor."""

    uid: str
    type: str  # "person" | "group"
    name: str
    email: str | None
    metadata: dict[str, Any]


@dataclass
class RelationPayload:
    """One Holocron relation."""

    uid: str
    from_uid: str
    to_uid: str
    type: str
    properties: dict[str, Any]


@dataclass
class MappedScan:
    """All Holocron payloads derived from a scan, ready to push."""

    assets: list[AssetPayload] = field(default_factory=list)
    actors: list[ActorPayload] = field(default_factory=list)
    relations: list[RelationPayload] = field(default_factory=list)


def _column_to_field_node(file_path: str, table_name: str, col: DetectedColumn) -> dict[str, Any]:
    node: dict[str, Any] = {
        "id": _schema_node_id("col", file_path, table_name, col.name),
        "name": col.name,
        "nodeType": "field",
        "dataType": _DATA_TYPE_MAP.get(col.inferred_type, "other"),
    }
    description_bits: list[str] = []
    if col.type_certainty < 1.0:
        description_bits.append(f"type certainty {col.type_certainty:.0%}")
    if col.sample_values:
        sample_str = ", ".join(str(v) for v in col.sample_values[:3])
        description_bits.append(f"e.g. {sample_str}")
    if description_bits:
        node["description"] = "; ".join(description_bits)
    return node


def _build_schema_tree(scan: ScanResult) -> list[dict[str, Any]]:
    """One top-level ``table`` container whose children are the detected fields."""
    table_name = scan.file_name
    return [
        {
            "id": _schema_node_id("table", scan.file_path, table_name),
            "name": table_name,
            "nodeType": "container",
            "containerType": "table",
            "description": (
                f"{scan.row_count} rows · delimiter='{scan.delimiter}' · encoding={scan.encoding}"
            ),
            "children": [
                _column_to_field_node(scan.file_path, table_name, c) for c in scan.columns
            ],
        }
    ]


def map_scan_to_holocron(scan: ScanResult) -> MappedScan:
    """Convert a ScanResult into deterministic Holocron payloads (schema-tree shape).

    Layout produced:
      - 1 Dataset asset per CSV file (with metadata.schema as a SchemaNode tree)
      - 1 Person actor per discovered actor, with an ``owns`` relation to the dataset
    """
    out = MappedScan()

    ds_uid = dataset_uid(scan.file_path)
    ds_metadata: dict[str, Any] = {
        "schema": _build_schema_tree(scan),
        "csv.encoding": scan.encoding,
        "csv.delimiter": scan.delimiter,
        "csv.has_header": scan.has_header,
        "csv.row_count": scan.row_count,
    }
    if scan.comment_lines:
        ds_metadata["csv.comment_lines"] = scan.comment_lines

    out.assets.append(
        AssetPayload(
            uid=ds_uid,
            type="dataset",
            name=scan.file_name,
            description=None,
            location=scan.file_path,
            metadata=ds_metadata,
        )
    )

    for actor in scan.actors:
        a_uid = actor_uid(actor)
        out.actors.append(
            ActorPayload(
                uid=a_uid,
                type="person",
                name=actor.name,
                email=actor.email,
                metadata={"role_hint": actor.role_hint},
            )
        )
        out.relations.append(
            RelationPayload(
                uid=relation_uid(a_uid, actor.relation_type, ds_uid),
                from_uid=a_uid,
                to_uid=ds_uid,
                type=actor.relation_type,
                properties={"role_hint": actor.role_hint},
            )
        )

    # Dedupe relations by uid
    seen_rels: set[str] = set()
    unique_rels: list[RelationPayload] = []
    for r in out.relations:
        if r.uid in seen_rels:
            continue
        seen_rels.add(r.uid)
        unique_rels.append(r)
    out.relations = unique_rels

    return out
