"""Base reader interface."""

from abc import ABC, abstractmethod

from holocron.readers.models import ScanResult


class BaseReader(ABC):
    """Abstract base class for all readers.

    Readers are plugins that scan external sources and suggest
    assets to be added to Holocron.
    """

    name: str
    description: str
    supported_sources: list[str]

    @abstractmethod
    async def scan(self, source: str, **options: object) -> ScanResult:
        """Scan a source and return suggested assets.

        Args:
            source: Path, URL, or connection string to scan.
            **options: Reader-specific options.

        Returns:
            ScanResult containing suggested assets and any errors.
        """
        pass

    def supports(self, source: str) -> bool:
        """Check if this reader supports the given source.

        Default implementation checks file extensions.
        Override for more complex matching.
        """
        import fnmatch

        return any(fnmatch.fnmatch(source, pattern) for pattern in self.supported_sources)
