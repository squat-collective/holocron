"""Bundle rendered Markdown pages into a single zip archive."""

from __future__ import annotations

import io
import zipfile

from data_dictionary_markdown.models import CatalogSnapshot
from data_dictionary_markdown.render import (
    RelationIndex,
    actor_path,
    asset_path,
    render_actor,
    render_asset,
    render_readme,
)


def write_dictionary_zip(snapshot: CatalogSnapshot) -> bytes:
    """Render the snapshot as a zip of Markdown pages.

    Layout:
        README.md            — index + counts
        assets/<slug>.md     — one per asset
        actors/<slug>.md     — one per actor

    Slugs are derived from `name`, falling back to `uid` if the name
    produces an empty slug. UIDs collide-resistant by themselves; using
    them as the fallback ensures unique filenames even when two assets
    share a name.
    """
    idx = RelationIndex.build(snapshot)
    buf = io.BytesIO()
    # ZIP_DEFLATED keeps the archive small enough that 1000 assets fits
    # comfortably under a typical browser download cap.
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.md", render_readme(snapshot))
        for asset in snapshot.assets:
            z.writestr(asset_path(asset), render_asset(asset, idx))
        for actor in snapshot.actors:
            z.writestr(actor_path(actor), render_actor(actor, idx))
    return buf.getvalue()
