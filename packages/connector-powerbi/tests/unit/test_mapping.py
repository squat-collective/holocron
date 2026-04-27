"""Tests for the scan → Holocron payload mapping."""

from __future__ import annotations

from powerbi_connector.mapping import (
    _report_uid,
    _table_uid,
    map_scan,
)
from powerbi_connector.models import PbixScan, PbixTableRef


def _scan(file_name: str = "r.pbix", **over: object) -> PbixScan:
    base = {
        "file_name": file_name,
        "layout_present": True,
        "layout_version": 5,
        "page_count": 1,
        "visual_count": 1,
        "tables": [],
        "artefacts": ["Report/Layout", "DataModel"],
    }
    base.update(over)  # type: ignore[arg-type]
    return PbixScan.model_validate(base)


class TestMapScan:
    def test_empty_scan_produces_only_the_report_asset(self) -> None:
        assets, relations = map_scan(_scan(tables=[]))
        assert len(assets) == 1
        assert assets[0].type == "report"
        assert relations == []

    def test_one_table_produces_report_table_and_relation(self) -> None:
        assets, relations = map_scan(
            _scan(tables=[PbixTableRef(name="Sales", columns=["Amount", "Region"])])
        )
        types = sorted(a.type for a in assets)
        assert types == ["dataset", "report"]
        assert len(relations) == 1
        rel = relations[0]
        assert rel.type == "uses"
        # Relation goes report → table.
        report_uid = next(a.uid for a in assets if a.type == "report")
        table_uid = next(a.uid for a in assets if a.type == "dataset")
        assert rel.from_uid == report_uid
        assert rel.to_uid == table_uid

    def test_table_columns_become_schema_fields(self) -> None:
        _, _ = map_scan(_scan())  # quick sanity smoke
        assets, _ = map_scan(
            _scan(tables=[PbixTableRef(name="Sales", columns=["Amount", "Region"])])
        )
        table_asset = next(a for a in assets if a.type == "dataset")
        schema = table_asset.metadata["schema"]
        assert len(schema) == 1
        assert [c["name"] for c in schema[0]["children"]] == ["Amount", "Region"]

    def test_measure_placeholder_column_excluded_from_schema(self) -> None:
        # The "(measure)" sentinel survives in
        # `metadata.powerbi.columns_referenced` but doesn't pollute the
        # structured schema — a measure isn't a column.
        assets, _ = map_scan(
            _scan(
                tables=[
                    PbixTableRef(name="Sales", columns=["(measure)", "Amount"])
                ]
            )
        )
        table_asset = next(a for a in assets if a.type == "dataset")
        schema_columns = [c["name"] for c in table_asset.metadata["schema"][0]["children"]]
        assert schema_columns == ["Amount"]
        # …but the raw reference list keeps the measure marker so a
        # downstream tool can tell what was projected.
        assert "(measure)" in table_asset.metadata["powerbi"]["columns_referenced"]

    def test_report_asset_carries_artefact_inventory(self) -> None:
        assets, _ = map_scan(_scan())
        report = next(a for a in assets if a.type == "report")
        assert "Report/Layout" in report.metadata["powerbi"]["artefacts"]
        assert report.metadata["page_count"] == 1
        assert report.metadata["visual_count"] == 1

    def test_uids_are_deterministic_and_scoped(self) -> None:
        # Same file → same uid. Different file → different uid.
        a = _report_uid("r.pbix")
        b = _report_uid("r.pbix")
        c = _report_uid("other.pbix")
        assert a == b
        assert a != c

    def test_table_uid_scoped_to_file(self) -> None:
        # Two reports both reference a "Sales" table — the uids must
        # differ because they might be different tables semantically.
        a = _table_uid("report-a.pbix", "Sales")
        b = _table_uid("report-b.pbix", "Sales")
        assert a != b

    def test_report_location_is_an_upload_url(self) -> None:
        # We don't know where the .pbix lives on disk, so the location
        # is a synthetic `upload://` URL — same convention csv-connector
        # uses.
        assets, _ = map_scan(_scan(file_name="finance.pbix"))
        report = next(a for a in assets if a.type == "report")
        assert report.location == "upload://finance.pbix"
