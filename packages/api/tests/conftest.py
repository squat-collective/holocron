"""Pytest fixtures."""

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from holocron.api.middleware.rate_limit import limiter
from holocron.db.connection import neo4j_driver
from holocron.main import app

# Safety guard: `MATCH (n) DETACH DELETE n` in the teardown below wipes the
# entire Neo4j graph. Because Neo4j Community has a single database, tests
# that hit the shared instance will destroy any dev data. Require an explicit
# opt-in so `pytest` run against a populated DB fails loudly instead of
# silently nuking everything.
_TEST_DB_CONSENT = "HOLOCRON_TEST_ALLOW_WIPE"


def _assert_test_db_consent() -> None:
    if os.environ.get(_TEST_DB_CONSENT) != "1":
        raise RuntimeError(
            f"Tests would wipe the Neo4j graph but {_TEST_DB_CONSENT}=1 was not set.\n"
            "Run pytest against a dedicated test database and export "
            f"{_TEST_DB_CONSENT}=1 to consent.",
        )


@pytest.fixture(autouse=True)
def _disable_rate_limiter() -> None:
    """Tests share 127.0.0.1; the in-memory limiter would poison them sequentially."""
    limiter.enabled = False


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """Create an async test client with DB connection."""
    _assert_test_db_consent()

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
