"""Unit tests for formula parsing."""

from excel_connector.formulas import parse_formula


def test_direct_sheet_reference():
    f = parse_formula("C2", "=Customers!A1", current_sheet="Orders")
    assert f.precedent_sheets == ["Customers"]
    assert f.is_lookup is False
    assert f.precedent_external_files == []


def test_vlookup_extracts_target_sheet():
    f = parse_formula("C2", "=VLOOKUP(B2, Customers!A:B, 2, FALSE)", current_sheet="Orders")
    assert "Customers" in f.precedent_sheets
    assert f.is_lookup is True


def test_xlookup_is_recognised():
    f = parse_formula("D2", "=XLOOKUP(B2, Lookup!A:A, Lookup!B:B)", current_sheet="Main")
    assert "Lookup" in f.precedent_sheets
    assert f.is_lookup is True


def test_index_match_is_recognised():
    f = parse_formula(
        "D2", "=INDEX(Lookup!B:B, MATCH(B2, Lookup!A:A, 0))", current_sheet="Main"
    )
    assert "Lookup" in f.precedent_sheets
    assert f.is_lookup is True


def test_self_reference_excluded():
    f = parse_formula("C2", "=Orders!A1+Orders!A2", current_sheet="Orders")
    assert "Orders" not in f.precedent_sheets


def test_sheet_with_spaces_quoted():
    f = parse_formula("C2", "='Sales 2024'!A1", current_sheet="Summary")
    assert "Sales 2024" in f.precedent_sheets


def test_external_workbook_reference():
    f = parse_formula("D2", "=[Master.xlsx]Sheet1!A1", current_sheet="Local")
    assert "Master.xlsx" in f.precedent_external_files


def test_external_workbook_with_spaces():
    f = parse_formula("D2", "='[Q4 Sales.xlsx]Lookup'!A1:B5", current_sheet="Local")
    assert "Q4 Sales.xlsx" in f.precedent_external_files


def test_no_refs_means_no_precedents():
    f = parse_formula("A1", "=SUM(1, 2, 3)", current_sheet="Main")
    assert f.precedent_sheets == []
    assert f.precedent_external_files == []
    assert f.is_lookup is False


def test_precedent_sheets_are_unique():
    f = parse_formula(
        "C2",
        "=VLOOKUP(B2, Customers!A:B, 2, FALSE) + VLOOKUP(B2, Customers!C:D, 1, FALSE)",
        current_sheet="Orders",
    )
    assert f.precedent_sheets.count("Customers") == 1
