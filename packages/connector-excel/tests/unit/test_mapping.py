"""Unit tests for ScanResult → Holocron API payload mapping (schema-tree shape)."""

from pathlib import Path
from typing import Any

from excel_connector import scan_workbook
from excel_connector.mapping import (
    external_workbook_uid,
    map_scan_to_holocron,
    workbook_uid,
)


def _find_workbook_asset(mapped: Any) -> Any:
    return next(a for a in mapped.assets if a.type == "dataset" and "schema" in a.metadata)


def test_simple_scan_produces_one_workbook_asset(simple_xlsx: Path) -> None:
    result = scan_workbook(simple_xlsx)
    mapped = map_scan_to_holocron(result)

    # Schema-tree shape: just ONE asset for the workbook (no sheet/table assets)
    assert len(mapped.assets) == 1
    wb = mapped.assets[0]
    assert wb.type == "dataset"
    assert wb.uid == workbook_uid(result.file_path)
    assert wb.name == "simple.xlsx"


def test_schema_tree_matches_ui_convention(simple_xlsx: Path) -> None:
    result = scan_workbook(simple_xlsx)
    mapped = map_scan_to_holocron(result)
    wb = _find_workbook_asset(mapped)

    schema = wb.metadata["schema"]
    assert isinstance(schema, list) and len(schema) == 1

    sheet_node = schema[0]
    assert sheet_node["nodeType"] == "container"
    assert sheet_node["containerType"] == "sheet"
    assert sheet_node["name"] == "Sales"

    # Sheet contains one table
    table_node = sheet_node["children"][0]
    assert table_node["nodeType"] == "container"
    assert table_node["containerType"] == "table"
    assert table_node["name"] == "SalesTable"

    # Table contains 3 fields
    fields = table_node["children"]
    assert [f["name"] for f in fields] == ["id", "name", "amount"]
    assert all(f["nodeType"] == "field" for f in fields)
    assert fields[0]["dataType"] == "integer"
    assert fields[1]["dataType"] == "string"
    assert fields[2]["dataType"] == "float"


def test_uid_strategy_is_deterministic(simple_xlsx: Path) -> None:
    result = scan_workbook(simple_xlsx)
    mapped1 = map_scan_to_holocron(result)
    mapped2 = map_scan_to_holocron(result)

    uids1 = sorted(a.uid for a in mapped1.assets)
    uids2 = sorted(a.uid for a in mapped2.assets)
    assert uids1 == uids2


def test_lookup_creates_lineage_hint_not_relation(multi_sheet_xlsx: Path) -> None:
    """Within-workbook formula lineage lives in metadata.lineage_hints — not as a graph edge."""
    result = scan_workbook(multi_sheet_xlsx)
    mapped = map_scan_to_holocron(result)
    wb = _find_workbook_asset(mapped)

    hints = wb.metadata["lineage_hints"]
    assert any(
        h["from_sheet"] == "Customers"
        and h["to_sheet"] == "Orders"
        and h["is_lookup"] is True
        for h in hints
    )


def test_actor_creates_owns_relation_to_workbook(metadata_xlsx: Path) -> None:
    result = scan_workbook(metadata_xlsx)
    mapped = map_scan_to_holocron(result)

    wb_uid = workbook_uid(result.file_path)
    owns = [r for r in mapped.relations if r.type == "owns" and r.to_uid == wb_uid]
    assert len(owns) >= 1


def test_relations_are_deduplicated(multi_sheet_xlsx: Path) -> None:
    result = scan_workbook(multi_sheet_xlsx)
    mapped = map_scan_to_holocron(result)

    uids = [r.uid for r in mapped.relations]
    assert len(uids) == len(set(uids))


def test_workbook_metadata_passed_through(metadata_xlsx: Path) -> None:
    """Excel custom/core/app properties land on the workbook asset's metadata."""
    result = scan_workbook(metadata_xlsx)
    mapped = map_scan_to_holocron(result)
    wb = _find_workbook_asset(mapped)

    assert wb.metadata.get("core.title") == "Q4 Sales Report"
    assert wb.metadata.get("custom.Department") == "Finance"


def test_external_link_creates_separate_asset_and_feeds_relation(tmp_path: Path) -> None:
    """External workbooks remain entities so cross-file lineage is graph-queryable."""
    # Build a fake ScanResult with an external link entry — no need for a real referenced file.
    from excel_connector.models import (
        DetectedExternalLink,
        DetectedSheet,
        ScanResult,
    )

    fake_path = str(tmp_path / "main.xlsx")
    scan = ScanResult(
        file_path=fake_path,
        file_name="main.xlsx",
        sheets=[DetectedSheet(name="Local")],
        external_links=[
            DetectedExternalLink(
                target_path="Master.xlsx", referenced_from_sheets=["Local"]
            )
        ],
    )
    mapped = map_scan_to_holocron(scan)

    # Two assets: workbook + external workbook
    types = sorted(a.type for a in mapped.assets)
    assert types == ["dataset", "dataset"]

    ext_uid = external_workbook_uid("Master.xlsx")
    feeds = [r for r in mapped.relations if r.type == "feeds" and r.from_uid == ext_uid]
    assert len(feeds) == 1
    assert feeds[0].to_uid == workbook_uid(fake_path)
