"""Discover plugins via Python entry points and expose them at runtime.

Discovery happens once at app startup. Plugins are loaded from any installed
package that declares an entry point in the `holocron.plugins` group:

    [project.entry-points."holocron.plugins"]
    excel-connector = "excel_connector.plugin"

The pointed-to module must export `manifest` (PluginManifest) and `run`
(async callable). See `holocron.plugins.base` for the protocol.
"""

from __future__ import annotations

from importlib.metadata import entry_points
from typing import Any

from holocron.core.logging import get_logger
from holocron.plugins.base import Plugin, PluginManifest

logger = get_logger(__name__)

ENTRY_POINT_GROUP = "holocron.plugins"


class PluginRegistry:
    """Singleton-ish registry holding all discovered plugins keyed by slug."""

    def __init__(self) -> None:
        self._plugins: dict[str, Any] = {}

    def discover(self) -> None:
        """Scan installed packages for `holocron.plugins` entry points and load them."""
        eps = entry_points(group=ENTRY_POINT_GROUP)
        loaded = 0
        for ep in eps:
            try:
                plugin = ep.load()
                self._validate(plugin, ep.name)
                slug = plugin.manifest.slug
                if slug in self._plugins:
                    logger.warning(
                        "Plugin slug collision",
                        extra={"slug": slug, "previous": self._plugins[slug], "new": plugin},
                    )
                self._plugins[slug] = plugin
                loaded += 1
                logger.info(
                    "Loaded plugin",
                    extra={
                        "entry_point": ep.name,
                        "slug": slug,
                        "capability": plugin.manifest.capability.value,
                    },
                )
            except Exception as e:  # pragma: no cover — guard against broken plugins
                logger.error(
                    "Failed to load plugin",
                    extra={"entry_point": ep.name, "error": str(e)},
                )
        logger.info("Plugin discovery complete", extra={"count": loaded})

    def register(self, plugin: Any) -> None:
        """Manual registration (useful for tests)."""
        self._validate(plugin, plugin.manifest.slug)
        self._plugins[plugin.manifest.slug] = plugin

    def manifests(self) -> list[PluginManifest]:
        return [p.manifest for p in self._plugins.values()]

    def get(self, slug: str) -> Plugin | None:
        return self._plugins.get(slug)

    def all(self) -> list[Plugin]:
        return list(self._plugins.values())

    def clear(self) -> None:
        """Drop all registrations (for tests)."""
        self._plugins.clear()

    @staticmethod
    def _validate(plugin: Any, name: str) -> None:
        if not hasattr(plugin, "manifest") or not isinstance(plugin.manifest, PluginManifest):
            raise TypeError(f"Plugin '{name}' is missing a PluginManifest at .manifest")
        if not hasattr(plugin, "run") or not callable(plugin.run):
            raise TypeError(f"Plugin '{name}' is missing a callable .run")


_registry = PluginRegistry()


def get_registry() -> PluginRegistry:
    return _registry
