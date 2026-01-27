"""Shared API dependencies."""

from typing import Annotated, AsyncIterator

from fastapi import Depends
from neo4j import AsyncSession

from holocron.db.connection import neo4j_driver


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Yield a Neo4j session for request handling."""
    async with neo4j_driver.session() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db_session)]
