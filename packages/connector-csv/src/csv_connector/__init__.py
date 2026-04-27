"""CSV connector for Holocron."""

from csv_connector.models import (
    DetectedActor,
    DetectedColumn,
    ScanResult,
)
from csv_connector.scanner import scan_csv

__version__ = "0.1.0"
DISCOVERED_BY = f"csv-connector@{__version__}"

__all__ = [
    "DISCOVERED_BY",
    "DetectedActor",
    "DetectedColumn",
    "ScanResult",
    "scan_csv",
]
