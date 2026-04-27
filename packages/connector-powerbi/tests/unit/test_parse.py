"""Tests for the Layout-JSON parser."""

from __future__ import annotations

import json

from powerbi_connector.parse import parse_scan


def _layout_with_visuals(*queries: dict) -> dict:
    """Build a minimal Layout JSON wrapping the given visual queries."""
    return {
        "version": 5,
        "sections": [
            {
                "name": "p1",
                "visualContainers": [
                    {"query": json.dumps(q)} for q in queries
                ],
            }
        ],
    }


class TestParseScan:
    def test_layout_missing_yields_empty_scan(self) -> None:
        scan = parse_scan(file_name="x.pbix", layout=None, artefacts=["DataModel"])
        assert scan.layout_present is False
        assert scan.tables == []
        assert scan.artefacts == ["DataModel"]

    def test_basic_table_column_extraction(self) -> None:
        layout = _layout_with_visuals(
            {
                "Version": 5,
                "From": [{"Name": "s", "Entity": "Sales", "Type": 0}],
                "Select": [
                    {
                        "Column": {
                            "Expression": {"SourceRef": {"Source": "s"}},
                            "Property": "Amount",
                        }
                    }
                ],
            }
        )
        scan = parse_scan(file_name="r.pbix", layout=layout, artefacts=[])
        assert scan.layout_present is True
        assert scan.layout_version == 5
        assert scan.page_count == 1
        assert scan.visual_count == 1
        assert len(scan.tables) == 1
        assert scan.tables[0].name == "Sales"
        assert scan.tables[0].columns == ["Amount"]

    def test_dedupes_columns_across_visuals(self) -> None:
        # Two visuals reading the same column from the same table —
        # the resulting table ref should list the column once.
        same_query = {
            "Version": 5,
            "From": [{"Name": "s", "Entity": "Sales"}],
            "Select": [
                {
                    "Column": {
                        "Expression": {"SourceRef": {"Source": "s"}},
                        "Property": "Amount",
                    }
                }
            ],
        }
        scan = parse_scan(
            file_name="r.pbix",
            layout=_layout_with_visuals(same_query, same_query),
            artefacts=[],
        )
        assert len(scan.tables) == 1
        assert scan.tables[0].columns == ["Amount"]
        # `visual_count` still reports 2 — the dedup is on tables/columns,
        # not on the underlying visual count.
        assert scan.visual_count == 2

    def test_multiple_tables_sorted_by_name(self) -> None:
        layout = _layout_with_visuals(
            {
                "From": [{"Name": "p", "Entity": "Products"}],
                "Select": [
                    {
                        "Column": {
                            "Expression": {"SourceRef": {"Source": "p"}},
                            "Property": "Sku",
                        }
                    }
                ],
            },
            {
                "From": [{"Name": "c", "Entity": "Customers"}],
                "Select": [
                    {
                        "Column": {
                            "Expression": {"SourceRef": {"Source": "c"}},
                            "Property": "Email",
                        }
                    }
                ],
            },
        )
        scan = parse_scan(file_name="r.pbix", layout=layout, artefacts=[])
        # Tables come back in deterministic alphabetical order so
        # downstream consumers can compare scans byte-for-byte.
        assert [t.name for t in scan.tables] == ["Customers", "Products"]

    def test_measure_resolves_to_table_with_placeholder_column(self) -> None:
        # A `Measure` projection points at a table but doesn't name a
        # concrete column. We still want the table to surface (it's
        # part of the lineage edge); column shows as "(measure)".
        layout = _layout_with_visuals(
            {
                "From": [{"Name": "s", "Entity": "Sales"}],
                "Select": [
                    {
                        "Measure": {
                            "Expression": {"SourceRef": {"Source": "s"}}
                        }
                    }
                ],
            }
        )
        scan = parse_scan(file_name="r.pbix", layout=layout, artefacts=[])
        assert len(scan.tables) == 1
        assert scan.tables[0].name == "Sales"
        assert "(measure)" in scan.tables[0].columns

    def test_unknown_alias_skipped_silently(self) -> None:
        # Projection points at an alias that wasn't declared in From.
        # Could indicate a stale/buggy Layout; we drop the projection
        # rather than fabricating a phantom table.
        layout = _layout_with_visuals(
            {
                "From": [{"Name": "s", "Entity": "Sales"}],
                "Select": [
                    {
                        "Column": {
                            "Expression": {"SourceRef": {"Source": "ghost"}},
                            "Property": "Whatever",
                        }
                    }
                ],
            }
        )
        scan = parse_scan(file_name="r.pbix", layout=layout, artefacts=[])
        assert scan.tables == []

    def test_direct_entity_in_source_ref(self) -> None:
        # Some Layout variants put `Entity` directly on the SourceRef
        # instead of going through a `From` alias. Honour both shapes.
        layout = _layout_with_visuals(
            {
                "Select": [
                    {
                        "Column": {
                            "Expression": {"SourceRef": {"Entity": "Inline"}},
                            "Property": "X",
                        }
                    }
                ],
            }
        )
        scan = parse_scan(file_name="r.pbix", layout=layout, artefacts=[])
        assert [t.name for t in scan.tables] == ["Inline"]

    def test_corrupt_visual_query_is_skipped(self) -> None:
        # A visual whose `query` isn't valid JSON shouldn't kill the
        # whole scan — log nothing, drop the visual, keep going.
        layout = {
            "version": 5,
            "sections": [
                {
                    "visualContainers": [
                        {"query": "not-json"},
                        {
                            "query": json.dumps(
                                {
                                    "From": [{"Name": "s", "Entity": "Sales"}],
                                    "Select": [
                                        {
                                            "Column": {
                                                "Expression": {
                                                    "SourceRef": {"Source": "s"}
                                                },
                                                "Property": "Amount",
                                            }
                                        }
                                    ],
                                }
                            )
                        },
                    ]
                }
            ],
        }
        scan = parse_scan(file_name="r.pbix", layout=layout, artefacts=[])
        assert [t.name for t in scan.tables] == ["Sales"]

    def test_string_version_is_coerced(self) -> None:
        scan = parse_scan(
            file_name="r.pbix",
            layout={"version": "7", "sections": []},
            artefacts=[],
        )
        assert scan.layout_version == 7

    def test_garbage_version_becomes_none(self) -> None:
        scan = parse_scan(
            file_name="r.pbix",
            layout={"version": "v5-final", "sections": []},
            artefacts=[],
        )
        assert scan.layout_version is None
