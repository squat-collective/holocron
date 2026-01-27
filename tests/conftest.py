"""Pytest fixtures."""

import pytest
from fastapi.testclient import TestClient

from holocron.main import app


@pytest.fixture
def client() -> TestClient:
    """Create a test client."""
    return TestClient(app)


# TODO: Add fixtures for:
# - Neo4j test database
# - Sample assets, actors, relations
# - Mock readers
