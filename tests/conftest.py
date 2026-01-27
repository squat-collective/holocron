"""Pytest fixtures."""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from holocron.db.connection import neo4j_driver
from holocron.main import app


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """Create an async test client with DB connection."""
    # Connect to database
    await neo4j_driver.connect()

    # Yield test client
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    # Clean up database after test
    async with neo4j_driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")

    # Disconnect
    await neo4j_driver.disconnect()
