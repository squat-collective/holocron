"""Pure parsing layer — turn a Layout JSON dict into a `PbixScan`.

The Layout JSON is undocumented but stable enough across PBIX versions
that we can extract:

  - the version stamp (`config.version` or top-level `version`),
  - the page count (`sections[]` length) and visual count
    (`sections[].visualContainers[]` lengths),
  - and — the most valuable — the distinct `(table, columns)` tuples
    referenced from each visual.

Visual containers carry a JSON-encoded `query` string that follows the
DAX query model:

    {
      "Version": 5,
      "From": [{"Name": "s", "Entity": "Sales", "Type": 0}, ...],
      "Select": [
        {"Column": {"Expression": {"SourceRef": {"Source": "s"}}, "Property": "Amount"}, ...}
      ]
    }

Each `From` clause defines a local alias → entity mapping (entity =
table name). Each `Select` projection references either a `Column` or
a `Measure` that points back at one of those aliases. We walk every
visual's query and union the (entity, columns) sets into a deduped
`PbixTableRef` list.

Everything is best-effort: unfamiliar shapes are skipped silently
rather than raising, so a single weird visual can't poison the scan.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from powerbi_connector.models import PbixScan, PbixTableRef


def parse_scan(
    *, file_name: str, layout: Any, artefacts: list[str]
) -> PbixScan:
    """Build a `PbixScan` from the artefact inventory + parsed Layout
    JSON. `layout` may be None when the Layout entry was missing or
    failed to decode."""
    if not isinstance(layout, dict):
        return PbixScan(file_name=file_name, artefacts=artefacts)

    version = _coerce_int(layout.get("version"))
    sections = layout.get("sections")
    if not isinstance(sections, list):
        sections = []

    visual_count = 0
    table_columns: dict[str, set[str]] = {}

    for section in sections:
        if not isinstance(section, dict):
            continue
        containers = section.get("visualContainers") or []
        if not isinstance(containers, list):
            continue
        for container in containers:
            if not isinstance(container, dict):
                continue
            visual_count += 1
            for table, columns in _refs_from_container(container):
                table_columns.setdefault(table, set()).update(columns)

    tables = [
        PbixTableRef(name=name, columns=sorted(cols))
        for name, cols in sorted(table_columns.items())
    ]

    return PbixScan(
        file_name=file_name,
        layout_present=True,
        layout_version=version,
        page_count=len(sections),
        visual_count=visual_count,
        tables=tables,
        artefacts=artefacts,
    )


@dataclass(frozen=True)
class _Ref:
    """One (table, column) pair from a single visual."""

    table: str
    column: str


def _refs_from_container(container: dict[str, Any]) -> list[tuple[str, list[str]]]:
    """Pull every (table, columns) ref out of one visual.

    Walks the embedded `query` JSON if present, then the `config`
    JSON's `singleVisual.prototypeQuery` as a fallback. Returns a list
    of `(table, [columns])` tuples — typically one per query.
    """
    refs: list[_Ref] = []
    for key in ("query", "config"):
        embedded = container.get(key)
        if not isinstance(embedded, str) or not embedded:
            continue
        try:
            doc = json.loads(embedded)
        except json.JSONDecodeError:
            continue
        refs.extend(_refs_from_query_doc(doc))

    if not refs:
        return []

    by_table: dict[str, set[str]] = {}
    for r in refs:
        by_table.setdefault(r.table, set()).add(r.column)
    return [(t, sorted(cols)) for t, cols in by_table.items()]


def _refs_from_query_doc(doc: Any) -> list[_Ref]:
    """Recursively walk a query/config JSON tree and yield refs.

    The tree carries `From` clauses (alias → entity) and `Select` /
    `Where` projections referencing those aliases. We keep an alias
    table per encountered scope so refs resolve correctly even in
    nested subqueries.
    """
    out: list[_Ref] = []
    _walk(doc, alias_to_entity={}, out=out)
    return out


def _walk(
    node: Any, *, alias_to_entity: dict[str, str], out: list[_Ref]
) -> None:
    """In-place walk; mutates `out` and the local alias dict."""
    if isinstance(node, dict):
        # `From` extends the alias scope. Build a *copy* before
        # descending so siblings don't see this scope's aliases.
        new_aliases = dict(alias_to_entity)
        from_clause = node.get("From")
        if isinstance(from_clause, list):
            for entry in from_clause:
                if not isinstance(entry, dict):
                    continue
                alias = entry.get("Name")
                entity = entry.get("Entity")
                if isinstance(alias, str) and isinstance(entity, str) and entity:
                    new_aliases[alias] = entity

        # `Select` is a list of projections — try to resolve each.
        select = node.get("Select")
        if isinstance(select, list):
            for projection in select:
                ref = _projection_ref(projection, new_aliases)
                if ref is not None:
                    out.append(ref)

        # Recurse into every child value with the (potentially
        # extended) alias scope.
        for key, value in node.items():
            if key in {"From", "Select"}:
                continue
            _walk(value, alias_to_entity=new_aliases, out=out)
    elif isinstance(node, list):
        for item in node:
            _walk(item, alias_to_entity=alias_to_entity, out=out)


def _projection_ref(
    projection: Any, aliases: dict[str, str]
) -> _Ref | None:
    """Pull (table, column) out of a single projection node, if it
    resolves to a Column with a known SourceRef alias.

    Measures (`Measure` rather than `Column`) skip the column slot —
    they reference an aggregate computed against the table, but the
    table itself is the lineage edge we care about. Surface them as
    a column named "(measure)" so the consumer sees the table is in
    play even if no concrete column was selected.
    """
    if not isinstance(projection, dict):
        return None
    for kind, label in (("Column", None), ("Measure", "(measure)")):
        slot = projection.get(kind)
        if not isinstance(slot, dict):
            continue
        expression = slot.get("Expression")
        if not isinstance(expression, dict):
            continue
        source_ref = expression.get("SourceRef")
        if not isinstance(source_ref, dict):
            continue
        alias = source_ref.get("Source")
        entity_direct = source_ref.get("Entity")
        if isinstance(entity_direct, str) and entity_direct:
            table = entity_direct
        elif isinstance(alias, str) and alias in aliases:
            table = aliases[alias]
        else:
            continue
        if label is not None:
            column = label
        else:
            column = slot.get("Property")
            if not isinstance(column, str) or not column:
                continue
        return _Ref(table=table, column=column)
    return None


def _coerce_int(value: Any) -> int | None:
    """Best-effort int — Layout `version` is sometimes an int and
    sometimes a numeric string."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None
