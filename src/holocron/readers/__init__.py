"""Reader plugin system."""

from holocron.readers.base import BaseReader
from holocron.readers.models import ScanResult, Suggestion

__all__ = ["BaseReader", "Suggestion", "ScanResult"]
