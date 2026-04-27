"""Unit tests for column type inference."""

from datetime import date, datetime

from excel_connector.columns import infer_column
from excel_connector.models import ColumnType


def test_all_strings_are_string():
    col = infer_column("name", 0, ["a", "b", "c"])
    assert col.inferred_type == ColumnType.STRING
    assert col.type_certainty == 1.0
    assert col.has_formulas is False


def test_all_integers_are_integer():
    col = infer_column("id", 0, [1, 2, 3, 4])
    assert col.inferred_type == ColumnType.INTEGER
    assert col.type_certainty == 1.0


def test_all_floats_are_float():
    col = infer_column("price", 0, [1.5, 2.5, 3.5])
    assert col.inferred_type == ColumnType.FLOAT


def test_dates_are_datetime():
    col = infer_column("when", 0, [datetime(2026, 1, 1), datetime(2026, 2, 1)])
    assert col.inferred_type == ColumnType.DATETIME


def test_pure_dates_are_date():
    col = infer_column("when", 0, [date(2026, 1, 1), date(2026, 2, 1)])
    assert col.inferred_type == ColumnType.DATE


def test_empty_column_is_empty():
    col = infer_column("blank", 0, [None, "", None])
    assert col.inferred_type == ColumnType.EMPTY


def test_formulas_are_flagged():
    col = infer_column("calc", 0, ["=A1+B1", "=A2+B2", "=A3+B3"])
    assert col.has_formulas is True
    assert col.inferred_type == ColumnType.FORMULA


def test_mixed_types_below_threshold_is_mixed():
    # 3 strings + 2 ints = 60% strings → below 70% threshold → MIXED
    col = infer_column("dirty", 0, ["a", "b", "c", 1, 2])
    assert col.inferred_type == ColumnType.MIXED


def test_dominant_with_one_outlier_is_dominant():
    # 9 strings + 1 int = 90% strings → STRING with certainty 0.9
    col = infer_column("mostly_str", 0, ["a"] * 9 + [42])
    assert col.inferred_type == ColumnType.STRING
    assert col.type_certainty == 0.9


def test_sample_values_are_capped():
    col = infer_column("ids", 0, list(range(100)))
    assert len(col.sample_values) <= 5


def test_empty_cells_dont_affect_certainty():
    # 3 strings + 3 empties → 100% strings (empties excluded from denominator)
    col = infer_column("sparse", 0, ["a", None, "b", "", "c", None])
    assert col.inferred_type == ColumnType.STRING
    assert col.type_certainty == 1.0


def test_booleans_are_classified_separately_from_ints():
    col = infer_column("flag", 0, [True, False, True])
    assert col.inferred_type == ColumnType.BOOLEAN
