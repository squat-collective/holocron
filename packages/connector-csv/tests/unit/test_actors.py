"""Unit tests for actor extraction from CSV comment headers."""

from csv_connector.actors import extract_actors


def test_no_comment_lines_means_no_actors() -> None:
    assert extract_actors([]) == []


def test_owner_with_email_extracts_email_and_name() -> None:
    actors = extract_actors(["# Owner: jean@acme.com"])
    assert len(actors) == 1
    assert actors[0].email == "jean@acme.com"
    assert actors[0].relation_type == "owns"
    assert actors[0].role_hint == "comment_header:Owner"


def test_author_without_email() -> None:
    actors = extract_actors(["# Author: Jean Dupont"])
    assert len(actors) == 1
    assert actors[0].name == "Jean Dupont"
    assert actors[0].email is None


def test_case_insensitive_key() -> None:
    actors = extract_actors(["# OWNER: jean@acme.com", "# steward: Alice"])
    assert len(actors) == 2


def test_non_owner_keys_are_ignored() -> None:
    actors = extract_actors(["# Generated: 2026-01-01", "# Department: Finance"])
    assert actors == []


def test_name_with_email_strips_email_out_of_name() -> None:
    actors = extract_actors(["# Owner: Jean Dupont <jean@acme.com>"])
    assert len(actors) == 1
    assert actors[0].email == "jean@acme.com"
    assert "jean@acme.com" not in actors[0].name
    assert "Jean Dupont" in actors[0].name


def test_duplicates_are_deduplicated() -> None:
    actors = extract_actors(
        [
            "# Owner: jean@acme.com",
            "# Maintainer: jean@acme.com",  # same person, different key
        ]
    )
    assert len(actors) == 1


def test_multiple_hash_chars_accepted() -> None:
    actors = extract_actors(["## Owner: jean@acme.com"])
    assert len(actors) == 1


def test_non_comment_lines_ignored() -> None:
    actors = extract_actors(["Owner: jean@acme.com", "id,name,amount"])
    assert actors == []
