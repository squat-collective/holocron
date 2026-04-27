"""Formula parsing — extract precedent ranges from cell formulas (regex-based, v0.1)."""

import re

from excel_connector.models import DetectedFormula

# Sheet refs in formulas. Sheet names with spaces appear as 'Sheet Name'!A1; without
# spaces they appear as Sheet1!A1. Both should match.
#   - 'Sales 2024'!A1
#   - Sheet2!A:F
#   - Sheet2!$A$1:$F$100
_SHEET_REF_RE = re.compile(
    r"(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_ ]*))!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?"
)

# External file refs: [Master.xlsx]Sheet!A1 or '[Q4 Sales.xlsx]Lookup'!A:B
_EXTERNAL_REF_RE = re.compile(
    r"'?\[([^\]]+\.xlsx[mt]?)\][^!']*'?!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?",
    re.IGNORECASE,
)

# Lookup function names — when present, this is almost certainly a lineage source
_LOOKUP_FN_RE = re.compile(r"\b(VLOOKUP|HLOOKUP|XLOOKUP|INDEX|MATCH|XMATCH)\s*\(", re.IGNORECASE)


def parse_formula(cell_address: str, formula: str, current_sheet: str) -> DetectedFormula:
    """Parse a single formula string into a DetectedFormula with precedents extracted.

    Args:
        cell_address: Cell address like "C5".
        formula: Raw formula string (with or without leading "=").
        current_sheet: Name of the sheet the formula lives in (excluded from precedents).
    """
    if not formula.startswith("="):
        formula = f"={formula}"

    # External refs first — they overlap with sheet refs syntactically, so we strip
    # them after extraction to avoid double-counting.
    external_files: list[str] = []
    stripped = formula
    for match in _EXTERNAL_REF_RE.finditer(formula):
        external_files.append(match.group(1))
        stripped = stripped.replace(match.group(0), "")

    precedent_sheets: list[str] = []
    for match in _SHEET_REF_RE.finditer(stripped):
        sheet_name = match.group(1) or match.group(2)
        if sheet_name and sheet_name != current_sheet and sheet_name not in precedent_sheets:
            precedent_sheets.append(sheet_name)

    return DetectedFormula(
        cell_address=cell_address,
        formula=formula,
        precedent_sheets=precedent_sheets,
        precedent_external_files=list(dict.fromkeys(external_files)),  # dedupe, preserve order
        is_lookup=bool(_LOOKUP_FN_RE.search(formula)),
    )
