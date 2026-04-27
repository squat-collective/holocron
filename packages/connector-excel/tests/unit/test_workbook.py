"""End-to-end scan tests — exercise the full extractor pipeline against fixtures."""

from pathlib import Path

from excel_connector import scan_workbook
from excel_connector.models import TableConfidence


def test_simple_scan_produces_one_sheet_one_table(simple_xlsx: Path) -> None:
    result = scan_workbook(simple_xlsx)
    assert len(result.sheets) == 1
    assert result.sheets[0].name == "Sales"
    assert len(result.sheets[0].tables) == 1
    assert result.sheets[0].tables[0].confidence == TableConfidence.CERTAIN


def test_multi_sheet_scan_produces_lineage(multi_sheet_xlsx: Path) -> None:
    result = scan_workbook(multi_sheet_xlsx)

    # Both sheets present
    sheet_names = {s.name for s in result.sheets}
    assert sheet_names == {"Customers", "Orders"}

    # Orders table has formulas pointing back at Customers
    orders = next(s for s in result.sheets if s.name == "Orders")
    formulas = orders.tables[0].formulas
    assert any("Customers" in f.precedent_sheets for f in formulas)


def test_metadata_scan_extracts_actors_and_props(metadata_xlsx: Path) -> None:
    result = scan_workbook(metadata_xlsx)

    # Custom Owner prop yields an owns-relation actor
    owners = [a for a in result.actors if a.relation_type == "owns"]
    assert any(a.email == "finance.team@acme.com" for a in owners)

    # Pass-through metadata exposes the custom Department prop
    assert result.workbook_metadata.get("custom.Department") == "Finance"
    assert result.workbook_metadata.get("core.title") == "Q4 Sales Report"


def test_file_path_is_absolute(simple_xlsx: Path) -> None:
    result = scan_workbook(simple_xlsx)
    assert result.file_path == str(simple_xlsx.resolve())
    assert result.file_name == "simple.xlsx"
