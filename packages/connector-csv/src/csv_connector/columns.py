"""Column type inference from sampled string values."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from typing import Any

from csv_connector.models import ColumnType, DetectedColumn

# Maximum cells to sample when inferring a column's type.
SAMPLE_SIZE = 50

# Maximum sample values to surface in the result.
SAMPLE_RETAIN = 5

# Values accepted as booleans (lowercased for matching).
_BOOL_VALUES = {"true", "false", "yes", "no", "y", "n", "t", "f", "0", "1"}

# Date formats we try, ordered strict → loose.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%Y/%m/%d",
)

_DATETIME_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
)


def _is_integer(value: str) -> bool:
    """Strict integer — no decimal point, optional leading sign."""
    s = value.strip()
    if not s:
        return False
    if s[0] in ("-", "+"):
        s = s[1:]
    return s.isdigit()


def _is_float(value: str) -> bool:
    """Accept anything `float(x)` parses, excluding bare ints (those return True too)."""
    s = value.strip()
    if not s:
        return False
    try:
        float(s)
    except ValueError:
        return False
    # Must have a dot or exponent to count as float (not int)
    return "." in s or "e" in s.lower()


def _is_boolean(value: str) -> bool:
    """Boolean only if the token is clearly one. We purposefully exclude '0'/'1'
    because they're ambiguous with integers."""
    s = value.strip().lower()
    return s in {"true", "false", "yes", "no"}


def _try_datetime(value: str) -> datetime | None:
    s = value.strip()
    for fmt in _DATETIME_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _try_date(value: str) -> date | None:
    s = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _classify_value(value: str) -> ColumnType:
    """Classify a single raw cell string into a ColumnType."""
    if value is None or value == "":
        return ColumnType.EMPTY
    s = value.strip()
    if not s:
        return ColumnType.EMPTY

    # Order matters: boolean before integer (True/False tokens), then int, float, then dates.
    if _is_boolean(s):
        return ColumnType.BOOLEAN
    if _is_integer(s):
        return ColumnType.INTEGER
    if _is_float(s):
        return ColumnType.FLOAT
    if _try_datetime(s) is not None:
        return ColumnType.DATETIME
    if _try_date(s) is not None:
        return ColumnType.DATE
    return ColumnType.STRING


def infer_column(name: str, index: int, values: list[str]) -> DetectedColumn:
    """Infer the type of a column from a list of raw string values."""
    sample = values[:SAMPLE_SIZE]

    classifications = [_classify_value(v) for v in sample]
    non_empty = [c for c in classifications if c != ColumnType.EMPTY]

    if not non_empty:
        return DetectedColumn(
            name=name,
            index=index,
            inferred_type=ColumnType.EMPTY,
            sample_values=[],
            type_certainty=1.0,
        )

    counts = Counter(non_empty)
    dominant_type, dominant_count = counts.most_common(1)[0]
    certainty = dominant_count / len(non_empty)

    # Promote integer → float when a column mixes ints and floats (numeric column).
    if ColumnType.INTEGER in counts and ColumnType.FLOAT in counts:
        numeric = counts[ColumnType.INTEGER] + counts[ColumnType.FLOAT]
        if numeric / len(non_empty) >= 0.9:
            inferred: ColumnType = ColumnType.FLOAT
            return DetectedColumn(
                name=name,
                index=index,
                inferred_type=inferred,
                sample_values=_first_n_non_empty(sample, SAMPLE_RETAIN),
                type_certainty=round(numeric / len(non_empty), 3),
            )

    inferred = dominant_type if certainty >= 0.7 else ColumnType.MIXED

    return DetectedColumn(
        name=name,
        index=index,
        inferred_type=inferred,
        sample_values=_first_n_non_empty(sample, SAMPLE_RETAIN),
        type_certainty=round(certainty, 3),
    )


def _first_n_non_empty(values: list[str], n: int) -> list[Any]:
    """First n values that aren't empty — for surfacing in the UI."""
    return [v for v in values if v is not None and v != ""][:n]
