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
        "CREATE CONSTRAINT rule_uid IF NOT EXISTS FOR (r:Rule) REQUIRE r.uid IS UNIQUE",
        "CREATE CONSTRAINT term_uid IF NOT EXISTS FOR (t:Term) REQUIRE t.uid IS UNIQUE",
        "CREATE CONSTRAINT webhook_uid IF NOT EXISTS FOR (w:Webhook) REQUIRE w.uid IS UNIQUE",
    ]

    indexes = [
        # Indexes on commonly queried fields
        "CREATE INDEX asset_name IF NOT EXISTS FOR (a:Asset) ON (a.name)",
        "CREATE INDEX asset_type IF NOT EXISTS FOR (a:Asset) ON (a.type)",
        "CREATE INDEX asset_status IF NOT EXISTS FOR (a:Asset) ON (a.status)",
        "CREATE INDEX actor_name IF NOT EXISTS FOR (a:Actor) ON (a.name)",
        "CREATE INDEX actor_type IF NOT EXISTS FOR (a:Actor) ON (a.type)",
        "CREATE INDEX actor_email IF NOT EXISTS FOR (a:Actor) ON (a.email)",
        "CREATE INDEX rule_name IF NOT EXISTS FOR (r:Rule) ON (r.name)",
        "CREATE INDEX rule_severity IF NOT EXISTS FOR (r:Rule) ON (r.severity)",
        "CREATE INDEX rule_category IF NOT EXISTS FOR (r:Rule) ON (r.category)",
        "CREATE INDEX term_name IF NOT EXISTS FOR (t:Term) ON (t.name)",
        "CREATE INDEX term_domain IF NOT EXISTS FOR (t:Term) ON (t.domain)",
        "CREATE INDEX term_status IF NOT EXISTS FOR (t:Term) ON (t.status)",
        "CREATE INDEX event_entity_uid IF NOT EXISTS FOR (e:Event) ON (e.entity_uid)",
        "CREATE INDEX event_entity_type IF NOT EXISTS FOR (e:Event) ON (e.entity_type)",
        "CREATE INDEX event_action IF NOT EXISTS FOR (e:Event) ON (e.action)",
        "CREATE INDEX event_timestamp IF NOT EXISTS FOR (e:Event) ON (e.timestamp)",
        # Vector indexes — powered by the lightweight fastembed/BGE-small
        # service. 384 dims, cosine similarity. Enables semantic search
        # ("find the asset that talks about revenue") without any external
        # search engine. See EmbeddingService for the CPU/memory tradeoffs.
        """
        CREATE VECTOR INDEX asset_embedding IF NOT EXISTS
        FOR (a:Asset) ON (a.embedding)
        OPTIONS {
            indexConfig: {
                `vector.dimensions`: 384,
                `vector.similarity_function`: 'cosine'
            }
        }
        """,
        """
        CREATE VECTOR INDEX actor_embedding IF NOT EXISTS
        FOR (a:Actor) ON (a.embedding)
        OPTIONS {
            indexConfig: {
                `vector.dimensions`: 384,
                `vector.similarity_function`: 'cosine'
            }
        }
        """,
        """
        CREATE VECTOR INDEX rule_embedding IF NOT EXISTS
        FOR (r:Rule) ON (r.embedding)
        OPTIONS {
            indexConfig: {
                `vector.dimensions`: 384,
                `vector.similarity_function`: 'cosine'
            }
        }
        """,
        # Full-text indexes — the keyword half of hybrid search. A pure
        # semantic ranker treats rare proper nouns as near-noise, so a
        # literal query like "Leia" would float semantic neighbours above
        # the actual entity. FTS gives us exact/prefix/fuzzy matches
        # alongside the vector index; `_ranked_*` merges both.
        """
        CREATE FULLTEXT INDEX asset_text IF NOT EXISTS
        FOR (a:Asset) ON EACH [a.name, a.description]
        """,
        """
        CREATE FULLTEXT INDEX actor_text IF NOT EXISTS
        FOR (a:Actor) ON EACH [a.name, a.description]
        """,
        """
        CREATE FULLTEXT INDEX rule_text IF NOT EXISTS
        FOR (r:Rule) ON EACH [r.name, r.description]
        """,
        # :Container / :Field are real graph nodes materialised from the
        # `asset.metadata.schema` JSON on every asset write. Giving them
        # their own vector + text indexes lets semantic/FTS column search
        # scale past the "top-60 parent assets" Python walk.
        """
        CREATE VECTOR INDEX container_embedding IF NOT EXISTS
        FOR (c:Container) ON (c.embedding)
        OPTIONS {
            indexConfig: {
                `vector.dimensions`: 384,
                `vector.similarity_function`: 'cosine'
            }
        }
        """,
        """
        CREATE VECTOR INDEX field_embedding IF NOT EXISTS
        FOR (f:Field) ON (f.embedding)
        OPTIONS {
            indexConfig: {
                `vector.dimensions`: 384,
                `vector.similarity_function`: 'cosine'
            }
        }
        """,
        """
        CREATE FULLTEXT INDEX container_text IF NOT EXISTS
        FOR (c:Container) ON EACH [c.name, c.description, c.path]
        """,
        """
        CREATE FULLTEXT INDEX field_text IF NOT EXISTS
        FOR (f:Field) ON EACH [f.name, f.description, f.path]
        """,
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
