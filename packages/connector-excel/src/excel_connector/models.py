"""Pydantic models for Excel scan results."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TableConfidence(str, Enum):
    """How confident we are that something is actually a table."""

    CERTAIN = "certain"  # Excel ListObject — explicitly defined
    INFERRED = "inferred"  # Heuristic detection of a contiguous region


class ColumnType(str, Enum):
    """Inferred type of a column based on sampled values."""

    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    FORMULA = "formula"  # Most/all values are formulas
    EMPTY = "empty"
    MIXED = "mixed"


class DetectedColumn(BaseModel):
    """One column inside a detected table."""

    name: str
    index: int  # 0-based position in the table
    inferred_type: ColumnType
    sample_values: list[Any] = Field(default_factory=list)
    has_formulas: bool = False
    type_certainty: float = 1.0  # 0..1 — fraction of non-empty cells matching inferred_type


class DetectedFormula(BaseModel):
    """A formula found in a cell, with extracted precedents."""

    cell_address: str  # e.g. "C5"
    formula: str  # Raw formula text including leading "="
    precedent_sheets: list[str] = Field(default_factory=list)  # Sheets referenced (excluding self)
    precedent_external_files: list[str] = Field(
        default_factory=list
    )  # External workbook filenames referenced
    is_lookup: bool = False  # Contains VLOOKUP/XLOOKUP/HLOOKUP/INDEX/MATCH


class DetectedTable(BaseModel):
    """A table detected in a sheet."""

    name: str  # ListObject name, or "<sheet_name>!table_<n>" for inferred
    sheet_name: str
    confidence: TableConfidence
    range: str  # e.g. "A1:F100"
    row_count: int
    columns: list[DetectedColumn] = Field(default_factory=list)
    formulas: list[DetectedFormula] = Field(default_factory=list)


class DetectedSheet(BaseModel):
    """One sheet in the workbook."""

    name: str
    visible: bool = True
    tables: list[DetectedTable] = Field(default_factory=list)


class DetectedExternalLink(BaseModel):
    """An external workbook referenced from this one."""

    target_path: str  # Original ref string (often relative like "Master.xlsx")
    referenced_from_sheets: list[str] = Field(default_factory=list)


class DetectedActor(BaseModel):
    """A person or group discovered from workbook metadata."""

    name: str
    email: str | None = None
    role_hint: str  # "creator", "manager", "last_modified_by", "owner_custom_prop", etc.
    relation_type: str  # "owns" | "uses" — which Holocron relation should we suggest


class ScanResult(BaseModel):
    """Full result of scanning a workbook."""

    file_path: str  # Absolute path of the scanned file
    file_name: str  # Just the basename
    workbook_metadata: dict[str, Any] = Field(default_factory=dict)
    sheets: list[DetectedSheet] = Field(default_factory=list)
    external_links: list[DetectedExternalLink] = Field(default_factory=list)
    actors: list[DetectedActor] = Field(default_factory=list)
