"""Tests for the .pbix open/extract layer."""

from __future__ import annotations

import zipfile

import pytest

from powerbi_connector.extract import PbixOpenError, open_pbix
from tests.conftest import make_pbix


class TestOpenPbix:
    def test_returns_layout_for_utf16_bom(self, simple_layout):  # type: ignore[no-untyped-def]
        body = make_pbix(layout=simple_layout, encoding="utf-16-le-bom")
        result = open_pbix(body)
        assert result["layout"] is not None
        assert result["layout"]["version"] == 5

    def test_returns_layout_for_utf16_no_bom(self, simple_layout):  # type: ignore[no-untyped-def]
        body = make_pbix(layout=simple_layout, encoding="utf-16-le-no-bom")
        assert open_pbix(body)["layout"] is not None

    def test_returns_layout_for_utf8_bom(self, simple_layout):  # type: ignore[no-untyped-def]
        body = make_pbix(layout=simple_layout, encoding="utf-8-bom")
        assert open_pbix(body)["layout"] is not None

    def test_returns_layout_for_utf8(self, simple_layout):  # type: ignore[no-untyped-def]
        body = make_pbix(layout=simple_layout, encoding="utf-8")
        assert open_pbix(body)["layout"] is not None

    def test_inventories_artefacts(self, simple_layout):  # type: ignore[no-untyped-def]
        body = make_pbix(layout=simple_layout)
        result = open_pbix(body)
        # Sorted artefact list — the inventory survives even when
        # everything else fails.
        assert "DataModel" in result["artefacts"]
        assert "Report/Layout" in result["artefacts"]
        assert "Settings" in result["artefacts"]

    def test_layout_missing_returns_none(self) -> None:
        body = make_pbix(layout=None)
        result = open_pbix(body)
        assert result["layout"] is None
        # Other artefacts still surface.
        assert "DataModel" in result["artefacts"]

    def test_invalid_zip_raises_friendly_error(self) -> None:
        with pytest.raises(PbixOpenError) as excinfo:
            open_pbix(b"this is not a zip")
        # Error message points the user at the actual problem rather
        # than dumping a stack trace.
        assert "valid .pbix" in str(excinfo.value)

    def test_corrupt_layout_falls_back_to_artefacts_only(self) -> None:
        # A real .pbix occasionally has Layout entries we can't parse
        # (format-version drift). Recovering with `layout=None` keeps
        # the rest of the scan running rather than failing the upload.
        body = make_pbix(
            layout=None,
            extra_artefacts={"Report/Layout": b"\xff\xfe\x00\x00garbage"},
        )
        result = open_pbix(body)
        assert result["layout"] is None
        assert "Report/Layout" in result["artefacts"]
