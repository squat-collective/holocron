"""Map a ScanResult into Holocron API payloads with deterministic UIDs.

Schema-tree shape: one Dataset asset per workbook. The workbook's
`metadata.schema` is a tree of SchemaNode objects matching the existing UI
convention (see packages/ui/src/components/features/admin/schema-editor.tsx):

    [
        { nodeType: "container", containerType: "sheet", name: "Customers",
          children: [
              { nodeType: "container", containerType: "table", name: "Customers",
                children: [
                    { nodeType: "field", dataType: "integer", name: "id" },
                    { nodeType: "field", dataType: "string",  name: "name" },
                ]
              }
          ]
        }
    ]

External workbooks remain *separate* Dataset assets so cross-file lineage is
queryable in the graph. Within-workbook lineage (formula precedents between
sheets) is recorded as structured `metadata.lineage_hints` on the workbook.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

from excel_connector.models import (
    ColumnType,
    DetectedActor,
    DetectedColumn,
    DetectedSheet,
    DetectedTable,
    ScanResult,
)


def _uid(*parts: str) -> str:
    """Deterministic 32-char hex UID derived from parts (sha256 prefix)."""
    return hashlib.sha256(":".join(parts).encode()).hexdigest()[:32]


def workbook_uid(file_path: str) -> str:
    return _uid("excel:workbook", file_path)


def external_workbook_uid(target_path: str) -> str:
    return _uid("excel:external_workbook", target_path)


def actor_uid(actor: DetectedActor) -> str:
    """Stable across files: same person referenced from multiple workbooks resolves
    to the same Holocron Person."""
    key = (actor.email or actor.name).lower()
    return _uid("excel:actor:person", key)


def relation_uid(source_uid: str, rel_type: str, target_uid: str) -> str:
    return _uid("excel:relation", source_uid, rel_type, target_uid)


def _schema_node_id(*parts: str) -> str:
    """Stable id for a SchemaNode (used as React key in the UI)."""
    return _uid("excel:schema", *parts)[:9]


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
    ColumnType.FORMULA: "calculated",
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


def _column_to_field_node(file_path: str, sheet: str, table: str, col: DetectedColumn) -> dict[str, Any]:
    node: dict[str, Any] = {
        "id": _schema_node_id("col", file_path, sheet, table, col.name),
        "name": col.name,
        "nodeType": "field",
        "dataType": _DATA_TYPE_MAP.get(col.inferred_type, "other"),
    }
    description_bits: list[str] = []
    if col.has_formulas and col.inferred_type != ColumnType.FORMULA:
        description_bits.append("contains formulas")
    if col.type_certainty < 1.0:
        description_bits.append(f"type certainty {col.type_certainty:.0%}")
    if col.sample_values:
        sample_str = ", ".join(str(v) for v in col.sample_values[:3])
        description_bits.append(f"e.g. {sample_str}")
    if description_bits:
        node["description"] = "; ".join(description_bits)
    return node


def _table_to_container_node(file_path: str, sheet: str, table: DetectedTable) -> dict[str, Any]:
    return {
        "id": _schema_node_id("table", file_path, sheet, table.name),
        "name": table.name,
        "nodeType": "container",
        "containerType": "table",
        "description": f"{table.confidence.value} · {table.row_count} rows · {table.range}",
        "children": [
            _column_to_field_node(file_path, sheet, table.name, c) for c in table.columns
        ],
    }


def _sheet_to_container_node(file_path: str, sheet: DetectedSheet) -> dict[str, Any]:
    node: dict[str, Any] = {
        "id": _schema_node_id("sheet", file_path, sheet.name),
        "name": sheet.name,
        "nodeType": "container",
        "containerType": "sheet",
        "children": [_table_to_container_node(file_path, sheet.name, t) for t in sheet.tables],
    }
    if not sheet.visible:
        node["description"] = "hidden"
    return node


def _build_schema_tree(scan: ScanResult) -> list[dict[str, Any]]:
    return [_sheet_to_container_node(scan.file_path, s) for s in scan.sheets]


def _build_lineage_hints(scan: ScanResult) -> list[dict[str, Any]]:
    """In-workbook formula lineage as structured strings (no graph entities)."""
    hints: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for sheet in scan.sheets:
        for table in sheet.tables:
            for formula in table.formulas:
                for source_sheet in formula.precedent_sheets:
                    key = (source_sheet, sheet.name, table.name, formula.cell_address)
                    if key in seen:
                        continue
                    seen.add(key)
                    hints.append(
                        {
                            "from_sheet": source_sheet,
                            "to_sheet": sheet.name,
                            "to_table": table.name,
                            "to_cell": formula.cell_address,
                            "via_formula": formula.formula,
                            "is_lookup": formula.is_lookup,
                        }
                    )
    return hints


def map_scan_to_holocron(scan: ScanResult) -> MappedScan:
    """Convert a ScanResult into deterministic Holocron payloads (schema-tree shape).

    Layout produced:
      - 1 Dataset asset per workbook (with metadata.schema as a SchemaNode tree)
      - 1 Dataset asset per *external* workbook reference, with feeds relation
      - 1 Person actor per discovered actor, with owns/uses relation to the workbook
    """
    out = MappedScan()

    # 1. Workbook dataset with embedded schema
    wb_uid = workbook_uid(scan.file_path)
    wb_metadata: dict[str, Any] = dict(scan.workbook_metadata)
    wb_metadata["schema"] = _build_schema_tree(scan)

    lineage_hints = _build_lineage_hints(scan)
    if lineage_hints:
        wb_metadata["lineage_hints"] = lineage_hints

    if scan.external_links:
        wb_metadata["external_links"] = [
            {
                "target": e.target_path,
                "referenced_from_sheets": e.referenced_from_sheets,
            }
            for e in scan.external_links
        ]

    out.assets.append(
        AssetPayload(
            uid=wb_uid,
            type="dataset",
            name=scan.file_name,
            description=str(scan.workbook_metadata.get("core.description") or "") or None,
            location=scan.file_path,
            metadata=wb_metadata,
        )
    )

    # 2. External workbooks → separate Dataset assets + cross-file lineage
    for ext in scan.external_links:
        ext_uid = external_workbook_uid(ext.target_path)
        out.assets.append(
            AssetPayload(
                uid=ext_uid,
                type="dataset",
                name=ext.target_path,
                description="External workbook referenced by another workbook's formulas",
                location=ext.target_path,
                metadata={
                    "discovered_via": "external_link",
                    "referenced_from_sheets": ext.referenced_from_sheets,
                    "parent_workbook_uid": wb_uid,
                },
            )
        )
        out.relations.append(
            RelationPayload(
                uid=relation_uid(ext_uid, "feeds", wb_uid),
                from_uid=ext_uid,
                to_uid=wb_uid,
                type="feeds",
                properties={"discovered_via": "external_link"},
            )
        )

    # 3. Actors with relation to the workbook
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
                uid=relation_uid(a_uid, actor.relation_type, wb_uid),
                from_uid=a_uid,
                to_uid=wb_uid,
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


def _jsonable(v: Any) -> Any:
    """Make a sample value JSON-friendly (kept for backwards-compat in tests)."""
    if v is None or isinstance(v, str | int | float | bool):
        return v
    return str(v)
