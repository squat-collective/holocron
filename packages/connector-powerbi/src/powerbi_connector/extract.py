"""Pure I/O layer — open a .pbix and surface its raw textual artefacts.

A `.pbix` is a ZIP archive containing a handful of named entries — the
ones we care about are textual:

  - **Layout** (or `Report/Layout`) — JSON describing pages and visuals.
    Encoded as UTF-16 LE in older PBIX versions, UTF-8 in newer ones.
    Always wrapped with a BOM, so we sniff before decoding.
  - **Connections** — JSON listing data source connections.
  - **Settings** — JSON with file-level settings.

Anything binary (DataModel, DataMashup) is ignored — we don't have a
parser for the proprietary formats and v1 doesn't claim to. The
`artefacts` list is filled with whatever is inside the zip so users can
see what a future version might pick up.
"""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any

# Map of "interesting" entry name → expected payload key. The names
# differ slightly between PBIX format versions (`Layout` vs
# `Report/Layout`); we accept either by matching the basename.
_LAYOUT_NAMES = frozenset({"Layout", "Report/Layout"})
_CONNECTIONS_NAMES = frozenset({"Connections", "Report/Connections"})


class PbixOpenError(ValueError):
    """Raised when the file isn't a valid .pbix.

    `ValueError` so the plugin route translates it to a 422 with the
    message — see `holocron.plugins.routes`.
    """


def open_pbix(body: bytes) -> dict[str, Any]:
    """Inspect a .pbix payload and return its readable parts.

    Returns a dict with:
      - `artefacts`: list of every entry name found in the zip
      - `layout`: parsed Layout JSON, or None
      - `connections`: parsed Connections JSON, or None

    Raises `PbixOpenError` if the bytes aren't a valid zip archive.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(body))
    except zipfile.BadZipFile as exc:
        raise PbixOpenError(
            "File doesn't look like a valid .pbix (zip header missing)."
        ) from exc

    artefacts = sorted(archive.namelist())
    layout = _read_first_json(archive, _LAYOUT_NAMES)
    connections = _read_first_json(archive, _CONNECTIONS_NAMES)

    return {
        "artefacts": artefacts,
        "layout": layout,
        "connections": connections,
    }


def _read_first_json(archive: zipfile.ZipFile, names: frozenset[str]) -> Any:
    """Return the first parseable entry whose name is in `names`.

    `None` if no entry matches or if every match fails to decode.
    Decoding tries UTF-16 LE first (older format), UTF-8 second; both
    paths strip a leading BOM. Errors are swallowed because a partly-
    corrupt PBIX should still produce a useful artefact list — the
    catch-all keeps the rest of the scan running.
    """
    for entry in archive.namelist():
        if entry not in names:
            continue
        try:
            raw = archive.read(entry)
            text = _decode(raw)
            return json.loads(text)
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return None


def _decode(raw: bytes) -> str:
    """Best-effort text decode of a PBIX entry.

    Tries UTF-16 LE first because the older PBIX format uses it for
    everything textual; falls back to UTF-8 for newer files. Strips a
    leading BOM in either path so `json.loads` gets clean input.
    """
    # UTF-16 LE BOM is FF FE — the older format always emits it.
    if raw.startswith(b"\xff\xfe"):
        return raw[2:].decode("utf-16-le")
    # UTF-8 BOM is EF BB BF — newer format may or may not include it.
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8")
    # No BOM. Try UTF-16 LE first (heuristic: PBIX historically used
    # it without a BOM in some entries) then UTF-8.
    try:
        return raw.decode("utf-16-le")
    except UnicodeDecodeError:
        return raw.decode("utf-8")
