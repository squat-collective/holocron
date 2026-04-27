"""Excel connector for Holocron."""

from excel_connector.models import (
    DetectedActor,
    DetectedColumn,
    DetectedExternalLink,
    DetectedFormula,
    DetectedSheet,
    DetectedTable,
    ScanResult,
    TableConfidence,
)
from excel_connector.workbook import scan_workbook

__version__ = "0.1.0"
DISCOVERED_BY = f"excel-connector@{__version__}"

__all__ = [
    "DISCOVERED_BY",
    "DetectedActor",
    "DetectedColumn",
    "DetectedExternalLink",
    "DetectedFormula",
    "DetectedSheet",
    "DetectedTable",
    "ScanResult",
    "TableConfidence",
    "scan_workbook",
]
