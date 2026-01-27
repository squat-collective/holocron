"""Reader discovery and registration."""

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from holocron.readers.base import BaseReader


class ReaderRegistry:
    """Registry for discovering and managing readers."""

    def __init__(self) -> None:
        self._readers: dict[str, "BaseReader"] = {}

    def register(self, reader: "BaseReader") -> None:
        """Register a reader."""
        self._readers[reader.name] = reader

    def get(self, name: str) -> "BaseReader | None":
        """Get a reader by name."""
        return self._readers.get(name)

    def list_readers(self) -> list["BaseReader"]:
        """List all registered readers."""
        return list(self._readers.values())

    def discover_plugins(self, plugins_dir: Path) -> None:
        """Discover and load readers from plugins directory.

        Looks for Python packages with a reader.py module
        that exports a reader instance.
        """
        # TODO: Implement plugin discovery
        # 1. Scan plugins_dir for directories with reader.py
        # 2. Import each module
        # 3. Get the 'reader' attribute (instance of BaseReader)
        # 4. Register it
        pass


# Global registry instance
reader_registry = ReaderRegistry()
