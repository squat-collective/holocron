"""Column header detection and type inference."""

from collections import Counter
from datetime import date, datetime
from typing import Any

from excel_connector.models import ColumnType, DetectedColumn

# Maximum number of cells to sample when inferring a column's type.
SAMPLE_SIZE = 50

# Maximum sample values to surface in the result for human eyeball.
SAMPLE_RETAIN = 5


def _classify_value(value: Any) -> ColumnType:
    """Classify a single cell value into a ColumnType."""
    if value is None or value == "":
        return ColumnType.EMPTY
    if isinstance(value, str):
        if value.startswith("="):
            return ColumnType.FORMULA
        return ColumnType.STRING
    if isinstance(value, bool):
        # Must come before int — bool is a subclass of int
        return ColumnType.BOOLEAN
    if isinstance(value, int):
        return ColumnType.INTEGER
    if isinstance(value, float):
        return ColumnType.FLOAT
    if isinstance(value, datetime):
        return ColumnType.DATETIME
    if isinstance(value, date):
        return ColumnType.DATE
    return ColumnType.STRING  # Fall back


def infer_column(name: str, index: int, values: list[Any]) -> DetectedColumn:
    """Infer the type of a column from a list of cell values."""
    sample = values[:SAMPLE_SIZE]

    classifications = [_classify_value(v) for v in sample]
    non_empty = [c for c in classifications if c != ColumnType.EMPTY]

    if not non_empty:
        return DetectedColumn(
            name=name,
            index=index,
            inferred_type=ColumnType.EMPTY,
            sample_values=[],
            has_formulas=False,
            type_certainty=1.0,
        )

    counts = Counter(non_empty)
    dominant_type, dominant_count = counts.most_common(1)[0]
    certainty = dominant_count / len(non_empty)

    # If a meaningful chunk of cells contain formulas, flag it
    has_formulas = ColumnType.FORMULA in counts

    # If the dominant type holds for less than ~70% of values, call it MIXED
    # but still report the leading candidate via has_formulas / sample_values.
    inferred_type = dominant_type if certainty >= 0.7 else ColumnType.MIXED

    sample_values = [v for v in sample if v is not None and v != ""][:SAMPLE_RETAIN]

    return DetectedColumn(
        name=name,
        index=index,
        inferred_type=inferred_type,
        sample_values=sample_values,
        has_formulas=has_formulas,
        type_certainty=round(certainty, 3),
    )
