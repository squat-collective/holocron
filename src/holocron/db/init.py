"""Database initialization with constraints and indexes."""

from neo4j import AsyncSession

from holocron.db.connection import neo4j_driver


async def init_constraints() -> None:
    """Create database constraints and indexes.

    Creates unique constraints on UIDs and indexes on commonly queried fields.
    Uses IF NOT EXISTS to be idempotent.
    """
    constraints = [
        # Unique constraints on UIDs
        "CREATE CONSTRAINT asset_uid IF NOT EXISTS FOR (a:Asset) REQUIRE a.uid IS UNIQUE",
        "CREATE CONSTRAINT actor_uid IF NOT EXISTS FOR (a:Actor) REQUIRE a.uid IS UNIQUE",
        "CREATE CONSTRAINT event_uid IF NOT EXISTS FOR (e:Event) REQUIRE e.uid IS UNIQUE",
    ]

    indexes = [
        # Indexes on commonly queried fields
        "CREATE INDEX asset_name IF NOT EXISTS FOR (a:Asset) ON (a.name)",
        "CREATE INDEX asset_type IF NOT EXISTS FOR (a:Asset) ON (a.type)",
        "CREATE INDEX asset_status IF NOT EXISTS FOR (a:Asset) ON (a.status)",
        "CREATE INDEX actor_name IF NOT EXISTS FOR (a:Actor) ON (a.name)",
        "CREATE INDEX actor_type IF NOT EXISTS FOR (a:Actor) ON (a.type)",
        "CREATE INDEX actor_email IF NOT EXISTS FOR (a:Actor) ON (a.email)",
        "CREATE INDEX event_entity_uid IF NOT EXISTS FOR (e:Event) ON (e.entity_uid)",
        "CREATE INDEX event_entity_type IF NOT EXISTS FOR (e:Event) ON (e.entity_type)",
        "CREATE INDEX event_action IF NOT EXISTS FOR (e:Event) ON (e.action)",
        "CREATE INDEX event_timestamp IF NOT EXISTS FOR (e:Event) ON (e.timestamp)",
    ]

    async with neo4j_driver.session() as session:
        await _run_statements(session, constraints)
        await _run_statements(session, indexes)


async def _run_statements(session: AsyncSession, statements: list[str]) -> None:
    """Execute a list of Cypher statements.

    Args:
        session: Neo4j async session.
        statements: List of Cypher statements to execute.
    """
    for statement in statements:
        await session.run(statement)
