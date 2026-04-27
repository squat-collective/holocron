"""Unit tests for database validators."""

import pytest

from holocron.db.utils import (
    ALLOWED_NODE_LABELS,
    ALLOWED_RELATIONSHIP_TYPES,
    validate_node_label,
    validate_relationship_type,
)


class TestValidateNodeLabel:
    """Tests for validate_node_label function."""

    def test_valid_asset_labels(self) -> None:
        """All asset type labels should be valid."""
        valid_labels = ["Dataset", "Report", "Process", "System"]
        for label in valid_labels:
            assert validate_node_label(label) == label

    def test_valid_actor_labels(self) -> None:
        """All actor type labels should be valid."""
        valid_labels = ["Person", "Group"]
        for label in valid_labels:
            assert validate_node_label(label) == label

    def test_invalid_label_raises_value_error(self) -> None:
        """Invalid labels should raise ValueError."""
        invalid_labels = ["Invalid", "Hacker", "Admin", "dataset", "DATASET"]
        for label in invalid_labels:
            with pytest.raises(ValueError, match=f"Invalid node label: {label}"):
                validate_node_label(label)

    def test_sql_injection_attempt_rejected(self) -> None:
        """SQL/Cypher injection attempts should be rejected."""
        injection_attempts = [
            "Asset})-[:OWNS]->(:Admin",
            "'; DROP DATABASE;--",
            "Asset DETACH DELETE n//",
        ]
        for attempt in injection_attempts:
            with pytest.raises(ValueError):
                validate_node_label(attempt)

    def test_allowlist_is_immutable(self) -> None:
        """The allowlist should be a frozenset (immutable)."""
        assert isinstance(ALLOWED_NODE_LABELS, frozenset)


class TestValidateRelationshipType:
    """Tests for validate_relationship_type function."""

    def test_valid_relationship_types(self) -> None:
        """All defined relationship types should be valid."""
        valid_types = [
            "OWNS", "USES", "FEEDS", "CONTAINS", "MEMBER_OF", "APPLIES_TO",
        ]
        for rel_type in valid_types:
            assert validate_relationship_type(rel_type) == rel_type

    def test_invalid_type_raises_value_error(self) -> None:
        """Invalid relationship types should raise ValueError."""
        # PRODUCES/CONSUMES/DERIVED_FROM were removed from the vocabulary
        # when we moved to an asset-only lineage model — they must now be
        # rejected like any other unknown type.
        invalid_types = [
            "INVALID", "owns", "Owns", "HACK",
            "PRODUCES", "CONSUMES", "DERIVED_FROM",
        ]
        for rel_type in invalid_types:
            with pytest.raises(ValueError, match=f"Invalid relationship type: {rel_type}"):
                validate_relationship_type(rel_type)

    def test_cypher_injection_attempt_rejected(self) -> None:
        """Cypher injection attempts should be rejected."""
        injection_attempts = [
            "OWNS]->(n) DETACH DELETE n WITH n MATCH [r:OWNS",
            "'; MATCH (n) DETACH DELETE n;--",
        ]
        for attempt in injection_attempts:
            with pytest.raises(ValueError):
                validate_relationship_type(attempt)

    def test_allowlist_is_immutable(self) -> None:
        """The allowlist should be a frozenset (immutable)."""
        assert isinstance(ALLOWED_RELATIONSHIP_TYPES, frozenset)
