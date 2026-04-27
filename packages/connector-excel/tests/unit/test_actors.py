"""Unit tests for actor extraction from workbook metadata."""

from pathlib import Path

import openpyxl

from excel_connector.actors import extract_actors


def _open(path: Path):
    return openpyxl.load_workbook(path, data_only=False, read_only=False)


def test_creator_extracted_when_real(metadata_xlsx: Path) -> None:
    wb = _open(metadata_xlsx)
    actors = extract_actors(wb)
    names = [a.name for a in actors]
    assert "Jean Dupont" in names


def test_last_modified_by_extracted(metadata_xlsx: Path) -> None:
    wb = _open(metadata_xlsx)
    actors = extract_actors(wb)
    last_mods = [a for a in actors if a.role_hint == "last_modified_by"]
    assert any(a.name == "Marie Curie" for a in last_mods)


def test_owner_custom_prop_creates_owns_relation(metadata_xlsx: Path) -> None:
    wb = _open(metadata_xlsx)
    actors = extract_actors(wb)
    owners = [a for a in actors if a.relation_type == "owns"]
    assert len(owners) >= 1
    owner = next(a for a in owners if "finance.team" in (a.email or ""))
    assert owner.email == "finance.team@acme.com"


def test_noise_creator_filtered(noisy_creator_xlsx: Path) -> None:
    wb = _open(noisy_creator_xlsx)
    actors = extract_actors(wb)
    # Microsoft Office User should NOT appear
    assert not any(a.name.lower() == "microsoft office user" for a in actors)
    # Real Person should appear
    assert any(a.name == "Real Person" for a in actors)


def test_dedup_same_person(metadata_xlsx: Path) -> None:
    wb = _open(metadata_xlsx)
    actors = extract_actors(wb)
    names = [(a.name.lower(), (a.email or "").lower()) for a in actors]
    assert len(names) == len(set(names))
