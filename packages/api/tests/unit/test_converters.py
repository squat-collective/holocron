"""Unit tests for data converters."""

from datetime import UTC, datetime
from unittest.mock import Mock

from holocron.db.utils import neo4j_datetime_to_python


class TestNeo4jDatetimeToPython:
    """Tests for neo4j_datetime_to_python function."""

    def test_python_datetime_passthrough(self) -> None:
        """Python datetime objects should pass through unchanged."""
        dt = datetime(2026, 1, 27, 12, 0, 0, tzinfo=UTC)
        result = neo4j_datetime_to_python(dt)
        assert result == dt

    def test_neo4j_datetime_conversion(self) -> None:
        """Neo4j DateTime objects should be converted via to_native()."""
        expected = datetime(2026, 1, 27, 12, 0, 0, tzinfo=UTC)

        # Mock Neo4j DateTime object with to_native method
        neo4j_dt = Mock()
        neo4j_dt.to_native.return_value = expected

        result = neo4j_datetime_to_python(neo4j_dt)

        assert result == expected
        neo4j_dt.to_native.assert_called_once()

    def test_object_without_to_native_passthrough(self) -> None:
        """Objects without to_native should pass through (type cast)."""
        # This tests the edge case where something is passed that's
        # already a datetime-compatible object
        dt = datetime(2026, 1, 27, 12, 0, 0, tzinfo=UTC)
        result = neo4j_datetime_to_python(dt)
        assert result == dt
