"""End-to-end scan tests — exercise the full scanner pipeline against fixtures."""

from pathlib import Path

from csv_connector import scan_csv
from csv_connector.models import ColumnType


def test_simple_csv_detects_comma_and_header(simple_csv: Path) -> None:
    result = scan_csv(simple_csv)
    assert result.delimiter == ","
    assert result.has_header is True
    assert result.row_count == 3
    assert [c.name for c in result.columns] == ["id", "name", "amount"]
    assert result.columns[0].inferred_type == ColumnType.INTEGER
    assert result.columns[1].inferred_type == ColumnType.STRING
    assert result.columns[2].inferred_type == ColumnType.FLOAT


def test_semicolon_delimited(semicolon_csv: Path) -> None:
    result = scan_csv(semicolon_csv)
    assert result.delimiter == ";"
    assert result.has_header is True
    assert [c.name for c in result.columns] == ["id", "name", "price"]


def test_tsv_delimited(tsv: Path) -> None:
    result = scan_csv(tsv)
    assert result.delimiter == "\t"
    assert [c.name for c in result.columns] == ["sku", "qty", "price"]
    assert result.columns[1].inferred_type == ColumnType.INTEGER
    assert result.columns[2].inferred_type == ColumnType.FLOAT


def test_pipe_delimited(pipe_csv: Path) -> None:
    result = scan_csv(pipe_csv)
    assert result.delimiter == "|"
    assert [c.name for c in result.columns] == ["id", "name", "active"]
    assert result.columns[2].inferred_type == ColumnType.BOOLEAN


def test_headerless_generates_col_names(headerless_csv: Path) -> None:
    result = scan_csv(headerless_csv)
    assert result.has_header is False
    assert [c.name for c in result.columns] == ["col_0", "col_1", "col_2"]
    # Row count should include the first row (which is data, not a header)
    assert result.row_count == 4


def test_commented_csv_extracts_actors_and_skips_comments(commented_csv: Path) -> None:
    result = scan_csv(commented_csv)

    # Header/data parsed correctly despite the leading comments
    assert result.has_header is True
    assert [c.name for c in result.columns] == ["id", "name", "amount"]
    assert result.row_count == 2

    # Two distinct owner actors (Owner + Author)
    emails = {a.email for a in result.actors}
    names = {a.name for a in result.actors}
    assert "finance.team@acme.com" in emails
    assert any("Jean Dupont" in n for n in names)

    # Comment lines are surfaced for provenance
    assert any("Owner" in line for line in result.comment_lines)


def test_non_utf8_encoding_falls_back(latin1_csv: Path) -> None:
    result = scan_csv(latin1_csv)
    assert result.encoding in {"cp1252", "latin-1"}
    # Verify accented content came through intact
    name_col = next(c for c in result.columns if c.name == "name")
    assert any("Caf" in str(v) for v in name_col.sample_values)


def test_mixed_types_column_promotes_to_float(mixed_types_csv: Path) -> None:
    result = scan_csv(mixed_types_csv)
    measurement = next(c for c in result.columns if c.name == "measurement")
    assert measurement.inferred_type == ColumnType.FLOAT


def test_date_and_datetime_columns(dated_csv: Path) -> None:
    result = scan_csv(dated_csv)
    created_on = next(c for c in result.columns if c.name == "created_on")
    created_at = next(c for c in result.columns if c.name == "created_at")
    assert created_on.inferred_type == ColumnType.DATE
    assert created_at.inferred_type == ColumnType.DATETIME


def test_booleans_column(booleans_csv: Path) -> None:
    result = scan_csv(booleans_csv)
    active = next(c for c in result.columns if c.name == "active")
    assert active.inferred_type == ColumnType.BOOLEAN


def test_ragged_rows_do_not_crash(ragged_csv: Path) -> None:
    result = scan_csv(ragged_csv)
    assert len(result.columns) == 3
    # Short row's missing cell becomes empty string; column c is still STRING/INTEGER-ish
    assert result.row_count == 3


def test_quoted_fields_with_commas(quoted_csv: Path) -> None:
    result = scan_csv(quoted_csv)
    name_col = next(c for c in result.columns if c.name == "name")
    # "Smith, John" should have landed as a single value
    assert any("Smith, John" in str(v) for v in name_col.sample_values)


def test_empty_file_with_only_comments(empty_csv: Path) -> None:
    result = scan_csv(empty_csv)
    assert result.row_count == 0
    assert result.columns == []
    # But the actor survived
    assert len(result.actors) == 1
    assert result.actors[0].email == "lonely@acme.com"


def test_file_path_is_absolute(simple_csv: Path) -> None:
    result = scan_csv(simple_csv)
    assert result.file_path == str(simple_csv.resolve())
    assert result.file_name == "simple.csv"
