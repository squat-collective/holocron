"""Test fixtures: synthetic .pbix files.

A .pbix is a ZIP archive — we build one in-memory with a fake Layout
JSON that mirrors the Microsoft schema's salient parts. No real .pbix
files are committed because they're proprietary binary blobs; the
fixtures here exercise every code path we care about.
"""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any

import pytest


def make_pbix(
    *,
    layout: dict[str, Any] | None = None,
    encoding: str = "utf-16-le-bom",
    extra_artefacts: dict[str, bytes] | None = None,
) -> bytes:
    """Build a fake .pbix in memory.

    `encoding` controls how the Layout JSON is encoded:
      - `utf-16-le-bom` — old PBIX (default)
      - `utf-16-le-no-bom` — old PBIX missing the BOM
      - `utf-8-bom` — newer PBIX
      - `utf-8` — newer PBIX, no BOM
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        if layout is not None:
            text = json.dumps(layout)
            if encoding == "utf-16-le-bom":
                payload = b"\xff\xfe" + text.encode("utf-16-le")
            elif encoding == "utf-16-le-no-bom":
                payload = text.encode("utf-16-le")
            elif encoding == "utf-8-bom":
                payload = b"\xef\xbb\xbf" + text.encode("utf-8")
            elif encoding == "utf-8":
                payload = text.encode("utf-8")
            else:
                raise ValueError(f"unknown encoding: {encoding}")
            z.writestr("Report/Layout", payload)
        # Always include a couple of binary stubs so the artefact list
        # mirrors what a real .pbix carries.
        z.writestr("DataModel", b"\x00binary-blob")
        z.writestr("Settings", b"\xff\xfe" + json.dumps({}).encode("utf-16-le"))
        for name, body in (extra_artefacts or {}).items():
            z.writestr(name, body)
    return buf.getvalue()


def visual(query_doc: dict[str, Any]) -> dict[str, Any]:
    """One visualContainer with the given query JSON. The query is
    JSON-string-encoded as it would be in a real .pbix."""
    return {"query": json.dumps(query_doc)}


@pytest.fixture
def simple_layout() -> dict[str, Any]:
    """A Layout with one page, one visual, referencing one column on
    one table — the easy path."""
    return {
        "version": 5,
        "sections": [
            {
                "name": "p1",
                "displayName": "Sales Overview",
                "visualContainers": [
                    visual(
                        {
                            "Version": 5,
                            "From": [
                                {"Name": "s", "Entity": "Sales", "Type": 0}
                            ],
                            "Select": [
                                {
                                    "Column": {
                                        "Expression": {
                                            "SourceRef": {"Source": "s"}
                                        },
                                        "Property": "Amount",
                                    }
                                }
                            ],
                        }
                    ),
                ],
            }
        ],
    }
