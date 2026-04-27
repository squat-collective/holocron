"""Unit tests for ScanResult → Holocron API payload mapping (schema-tree shape)."""

from pathlib import Path

from csv_connector import scan_csv
from csv_connector.mapping import (
    actor_uid,
    dataset_uid,
    map_scan_to_holocron,
)
from csv_connector.models import DetectedActor


def test_simple_scan_produces_one_dataset_asset(simple_csv: Path) -> None:
    result = scan_csv(simple_csv)
    mapped = map_scan_to_holocron(result)

    assert len(mapped.assets) == 1
    ds = mapped.assets[0]
    assert ds.type == "dataset"
    assert ds.uid == dataset_uid(result.file_path)
    assert ds.name == "simple.csv"


def test_schema_tree_matches_ui_convention(simple_csv: Path) -> None:
    result = scan_csv(simple_csv)
    mapped = map_scan_to_holocron(result)
    ds = mapped.assets[0]

    schema = ds.metadata["schema"]
    assert isinstance(schema, list) and len(schema) == 1

    # Top-level container is a single "table" — no sheet wrapper for CSV
    table_node = schema[0]
    assert table_node["nodeType"] == "container"
    assert table_node["containerType"] == "table"
    assert table_node["name"] == "simple.csv"

    # Fields match the CSV columns in order
    fields = table_node["children"]
    assert [f["name"] for f in fields] == ["id", "name", "amount"]
    assert all(f["nodeType"] == "field" for f in fields)
    assert fields[0]["dataType"] == "integer"
    assert fields[1]["dataType"] == "string"
    assert fields[2]["dataType"] == "float"


def test_uid_strategy_is_deterministic(simple_csv: Path) -> None:
    result = scan_csv(simple_csv)
    mapped1 = map_scan_to_holocron(result)
    mapped2 = map_scan_to_holocron(result)
    assert [a.uid for a in mapped1.assets] == [a.uid for a in mapped2.assets]


def test_actor_creates_owns_relation_to_dataset(commented_csv: Path) -> None:
    result = scan_csv(commented_csv)
    mapped = map_scan_to_holocron(result)

    ds_uid = dataset_uid(result.file_path)
    owns = [r for r in mapped.relations if r.type == "owns" and r.to_uid == ds_uid]
    assert len(owns) >= 1

    # Every relation's from_uid matches an emitted actor
    actor_uids = {a.uid for a in mapped.actors}
    for rel in owns:
        assert rel.from_uid in actor_uids


def test_csv_and_excel_actor_uids_collide_on_purpose() -> None:
    """The CSV connector intentionally shares the actor-UID prefix with excel-connector
    so the same Person resolves across formats."""
    actor = DetectedActor(name="Jean Dupont", email="jean@acme.com", role_hint="x")
    csv_uid = actor_uid(actor)
    # Re-derive the excel-style uid inline (don't import excel-connector — not a dep)
    import hashlib

    excel_uid = hashlib.sha256(
        f"excel:actor:person:{actor.email}".encode()
    ).hexdigest()[:32]
    assert csv_uid == excel_uid


def test_relations_are_deduplicated(commented_csv: Path) -> None:
    result = scan_csv(commented_csv)
    mapped = map_scan_to_holocron(result)
    uids = [r.uid for r in mapped.relations]
    assert len(uids) == len(set(uids))


def test_csv_metadata_passed_through(simple_csv: Path) -> None:
    result = scan_csv(simple_csv)
    mapped = map_scan_to_holocron(result)
    ds = mapped.assets[0]

    assert ds.metadata["csv.delimiter"] == ","
    assert ds.metadata["csv.has_header"] is True
    assert ds.metadata["csv.row_count"] == 3


def test_empty_csv_with_only_comments_still_emits_dataset(empty_csv: Path) -> None:
    result = scan_csv(empty_csv)
    mapped = map_scan_to_holocron(result)
    assert len(mapped.assets) == 1
    ds = mapped.assets[0]
    # Schema tree contains one table with zero children
    schema = ds.metadata["schema"]
    assert schema[0]["children"] == []
    # Actor from comment still makes it through
    assert len(mapped.actors) == 1
