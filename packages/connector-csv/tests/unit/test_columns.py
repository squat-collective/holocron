"""Unit tests for column type inference from raw string values."""

from csv_connector.columns import infer_column
from csv_connector.models import ColumnType


def test_all_strings_are_string() -> None:
    col = infer_column("name", 0, ["Alice", "Bob", "Charlie"])
    assert col.inferred_type == ColumnType.STRING
    assert col.type_certainty == 1.0


def test_all_integers_are_integer() -> None:
    col = infer_column("id", 0, ["1", "2", "3", "4"])
    assert col.inferred_type == ColumnType.INTEGER
    assert col.type_certainty == 1.0


def test_all_floats_are_float() -> None:
    col = infer_column("price", 0, ["1.5", "2.5", "3.5"])
    assert col.inferred_type == ColumnType.FLOAT


def test_negative_and_signed_integers() -> None:
    col = infer_column("delta", 0, ["-1", "+2", "-100", "0"])
    assert col.inferred_type == ColumnType.INTEGER


def test_iso_dates_are_date() -> None:
    col = infer_column("when", 0, ["2026-01-01", "2026-02-01", "2026-03-01"])
    assert col.inferred_type == ColumnType.DATE


def test_iso_datetimes_are_datetime() -> None:
    col = infer_column(
        "ts", 0, ["2026-01-01T10:00:00", "2026-02-01T11:30:00", "2026-03-01T12:45:00"]
    )
    assert col.inferred_type == ColumnType.DATETIME


def test_booleans_are_boolean() -> None:
    col = infer_column("flag", 0, ["true", "false", "true", "FALSE"])
    assert col.inferred_type == ColumnType.BOOLEAN


def test_empty_column_is_empty() -> None:
    col = infer_column("blank", 0, ["", "", ""])
    assert col.inferred_type == ColumnType.EMPTY
    assert col.type_certainty == 1.0


def test_mixed_int_and_float_promotes_to_float() -> None:
    col = infer_column("measurement", 0, ["1", "2.5", "3", "4.75", "5"])
    assert col.inferred_type == ColumnType.FLOAT


def test_mostly_string_with_outliers_stays_string() -> None:
    # 9 strings + 1 int = 90% strings → STRING
    col = infer_column("mostly", 0, ["alpha"] * 9 + ["42"])
    assert col.inferred_type == ColumnType.STRING
    assert col.type_certainty == 0.9


def test_below_threshold_is_mixed() -> None:
    # 3 strings + 2 ints = 60% strings → below 70% threshold → MIXED
    # (note: non-numeric-mix, so no int→float promotion)
    col = infer_column("dirty", 0, ["alpha", "beta", "gamma", "1", "2"])
    assert col.inferred_type == ColumnType.MIXED


def test_empty_cells_dont_affect_certainty() -> None:
    col = infer_column("sparse", 0, ["alpha", "", "beta", "", "gamma"])
    assert col.inferred_type == ColumnType.STRING
    assert col.type_certainty == 1.0


def test_sample_values_are_capped() -> None:
    col = infer_column("ids", 0, [str(i) for i in range(100)])
    assert len(col.sample_values) <= 5
