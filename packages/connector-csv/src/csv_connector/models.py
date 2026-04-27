"""Pydantic models for CSV scan results."""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ColumnType(StrEnum):
    """Inferred type of a column based on sampled string values."""

    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    EMPTY = "empty"
    MIXED = "mixed"


class DetectedColumn(BaseModel):
    """One column in the CSV."""

    name: str
    index: int  # 0-based position
    inferred_type: ColumnType
    sample_values: list[Any] = Field(default_factory=list)
    type_certainty: float = 1.0  # 0..1 — fraction of non-empty cells matching inferred_type


class DetectedActor(BaseModel):
    """A person discovered from a comment header (# Owner / # Author / ...)."""

    name: str
    email: str | None = None
    role_hint: str  # e.g. "comment_header:Owner"
    relation_type: str = "owns"


class ScanResult(BaseModel):
    """Full result of scanning a CSV file."""

    file_path: str  # Absolute path
    file_name: str  # Just the basename
    encoding: str  # Encoding that successfully decoded the file
    delimiter: str  # Detected field delimiter
    has_header: bool  # Whether the first data row is a header
    row_count: int  # Number of data rows (excluding the header, if present)
    columns: list[DetectedColumn] = Field(default_factory=list)
    actors: list[DetectedActor] = Field(default_factory=list)
    comment_lines: list[str] = Field(default_factory=list)  # Raw comment lines (for metadata)
