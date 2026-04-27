"""Relation repository for Neo4j operations."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from neo4j.exceptions import ConstraintError

from holocron.api.schemas.relations import (
    RelationCreate,
    RelationResponse,
    RelationType,
)
from holocron.core.exceptions import DuplicateError
from holocron.db.connection import neo4j_driver
from holocron.db.utils import (
    ExecutionContext,
    neo4j_datetime_to_python,
    validate_relationship_type,
)


def _record_to_relation(record: dict[str, Any]) -> RelationResponse:
    """Convert Neo4j record to RelationResponse."""
    properties = record.get("properties", "{}")
    if isinstance(properties, str):
        properties = json.loads(properties) if properties else {}

    return RelationResponse(
        uid=record["uid"],
        from_uid=record["from_uid"],
        to_uid=record["to_uid"],
        type=RelationType(record["type"]),
        verified=record.get("verified", True),
        discovered_by=record.get("discovered_by"),
        properties=properties,
        created_at=neo4j_datetime_to_python(record["created_at"]),
    )


class RelationRepository:
    """Repository for Relation CRUD operations in Neo4j."""

    async def create(
        self,
        relation: RelationCreate,
        tx: ExecutionContext | None = None,
    ) -> RelationResponse | None:
        """Create a new relation between two nodes.

        Args:
            relation: The relation data to create.
            tx: Optional transaction context. If None, creates its own session.

        Returns:
            The created relation response, or None if either node doesn't exist.
        """
        uid = relation.uid or str(uuid4())
        now = datetime.now(UTC)
        rel_type = validate_relationship_type(relation.type.value.upper())

        query = f"""
            MATCH (from {{uid: $from_uid}})
            MATCH (to {{uid: $to_uid}})
            CREATE (from)-[r:{rel_type} {{
                uid: $uid,
                type: $type,
                verified: $verified,
                discovered_by: $discovered_by,
                properties: $properties,
                created_at: $created_at
            }}]->(to)
            RETURN r.uid as uid,
                   $from_uid as from_uid,
                   $to_uid as to_uid,
                   r.type as type,
                   r.verified as verified,
                   r.discovered_by as discovered_by,
                   r.properties as properties,
                   r.created_at as created_at
        """

        params = {
            "from_uid": relation.from_uid,
            "to_uid": relation.to_uid,
            "uid": uid,
            "type": relation.type.value,
            "verified": relation.verified,
            "discovered_by": relation.discovered_by,
            "properties": json.dumps(relation.properties),
            "created_at": now,
        }

        try:
            if tx is not None:
                result = await tx.run(query, params)
                record = await result.single()
                if record is None:
                    return None
                return _record_to_relation(dict(record))

            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                record = await result.single()
                if record is None:
                    return None
                return _record_to_relation(dict(record))
        except ConstraintError as e:
            raise DuplicateError(f"Relation with uid '{uid}' already exists") from e

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> RelationResponse | None:
        """Get a relation by its UID.

        Args:
            uid: The unique identifier of the relation.
            tx: Optional transaction context.

        Returns:
            The relation response if found, None otherwise.
        """
        query = """
            MATCH (from)-[r {uid: $uid}]->(to)
            RETURN r.uid as uid,
                   from.uid as from_uid,
                   to.uid as to_uid,
                   r.type as type,
                   r.verified as verified,
                   r.discovered_by as discovered_by,
                   r.properties as properties,
                   r.created_at as created_at
        """

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _record_to_relation(dict(record))

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _record_to_relation(dict(record))

    async def list(
        self,
        relation_type: RelationType | None = None,
        from_uid: str | None = None,
        to_uid: str | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[RelationResponse], int]:
        """List relations with optional filtering.

        Args:
            relation_type: Optional type filter.
            from_uid: Optional source node filter.
            to_uid: Optional target node filter.
            limit: Maximum number of items to return.
            offset: Number of items to skip.
            tx: Optional transaction context.

        Returns:
            Tuple of (items, total_count).
        """
        where_parts: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if relation_type:
            where_parts.append("r.type = $type")
            params["type"] = relation_type.value

        if from_uid:
            where_parts.append("from.uid = $from_uid")
            params["from_uid"] = from_uid

        if to_uid:
            where_parts.append("to.uid = $to_uid")
            params["to_uid"] = to_uid

        query = f"""
            MATCH (from)-[r]->(to)
            WHERE r.uid IS NOT NULL
            {f"AND {' AND '.join(where_parts)}" if where_parts else ""}
            RETURN r.uid as uid,
                   from.uid as from_uid,
                   to.uid as to_uid,
                   r.type as type,
                   r.verified as verified,
                   r.discovered_by as discovered_by,
                   r.properties as properties,
                   r.created_at as created_at
            ORDER BY r.created_at DESC
            SKIP $offset
            LIMIT $limit
        """

        count_query = f"""
            MATCH (from)-[r]->(to)
            WHERE r.uid IS NOT NULL
            {f"AND {' AND '.join(where_parts)}" if where_parts else ""}
            RETURN count(r) as total
        """

        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
            items = [_record_to_relation(r) for r in records]

            count_result = await tx.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            records = await result.data()
            items = [_record_to_relation(r) for r in records]

            count_result = await session.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

    async def delete(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> bool:
        """Delete a relation by UID.

        Args:
            uid: The unique identifier of the relation.
            tx: Optional transaction context.

        Returns:
            True if deleted, False if not found.
        """
        query = """
            MATCH ()-[r {uid: $uid}]->()
            DELETE r
            RETURN count(r) as deleted
        """

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            return record is not None and record["deleted"] > 0

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            return record is not None and record["deleted"] > 0
