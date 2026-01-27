"""Reader plugin system."""

from holocron.readers.base import BaseReader
from holocron.readers.models import Suggestion, ScanResult

__all__ = ["BaseReader", "Suggestion", "ScanResult"]
