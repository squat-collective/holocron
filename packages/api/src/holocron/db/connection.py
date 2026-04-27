"""Neo4j connection management."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Self

from neo4j import AsyncDriver, AsyncGraphDatabase, AsyncSession, AsyncTransaction

from holocron.config import settings


class Neo4jDriver:
    """Async Neo4j driver wrapper."""

    _driver: AsyncDriver | None = None

    async def connect(self) -> None:
        """Initialize the Neo4j driver."""
        self._driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )

    async def disconnect(self) -> None:
        """Close the Neo4j driver."""
        if self._driver:
            await self._driver.close()
            self._driver = None

    async def verify_connectivity(self) -> bool:
        """Check if Neo4j is reachable."""
        if not self._driver:
            return False
        try:
            await self._driver.verify_connectivity()
            return True
        except Exception:
            return False

    def session(self) -> AsyncSession:
        """Get a new session."""
        if not self._driver:
            raise RuntimeError("Neo4j driver not initialized. Call connect() first.")
        return self._driver.session()

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[AsyncTransaction]:
        """Get a transaction context manager.

        Yields:
            AsyncTransaction: A transaction that auto-commits
            on successful exit or rolls back on exception.

        Example:
            async with neo4j_driver.transaction() as tx:
                await tx.run("CREATE (n:Node)")
                await tx.run("CREATE (m:Node)")
                # Auto-commits if no exception
        """
        async with self.session() as session:
            tx = await session.begin_transaction()
            try:
                yield tx
                await tx.commit()
            except Exception:
                await tx.rollback()
                raise

    async def __aenter__(self) -> Self:
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, *args: object) -> None:
        """Async context manager exit."""
        await self.disconnect()


# Global driver instance
neo4j_driver = Neo4jDriver()
