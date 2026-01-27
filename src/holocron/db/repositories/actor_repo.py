"""Actor repository for Neo4j operations."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from holocron.api.schemas.actors import ActorCreate, ActorResponse, ActorType, ActorUpdate
from holocron.db.connection import neo4j_driver
from holocron.db.utils import (
    ExecutionContext,
    neo4j_datetime_to_python,
    validate_node_label,
)


def _node_to_actor(node: dict[str, Any]) -> ActorResponse:
    """Convert Neo4j node to ActorResponse."""
    metadata = node.get("metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else {}

    return ActorResponse(
        uid=node["uid"],
        type=ActorType(node["type"]),
        name=node["name"],
        email=node.get("email"),
        description=node.get("description"),
        metadata=metadata,
        created_at=neo4j_datetime_to_python(node["created_at"]),
        updated_at=neo4j_datetime_to_python(node["updated_at"]),
    )


class ActorRepository:
    """Repository for Actor CRUD operations in Neo4j."""

    async def create(
        self,
        actor: ActorCreate,
        tx: ExecutionContext | None = None,
    ) -> ActorResponse:
        """Create a new actor in Neo4j.

        Args:
            actor: The actor data to create.
            tx: Optional transaction context. If None, creates its own session.

        Returns:
            The created actor response.
        """
        uid = str(uuid4())
        now = datetime.now(UTC)
        label = validate_node_label(actor.type.value.capitalize())

        query = f"""
            CREATE (a:Actor:{label} {{
                uid: $uid,
                type: $type,
                name: $name,
                email: $email,
                description: $description,
                metadata: $metadata,
                created_at: $created_at,
                updated_at: $updated_at
            }})
            RETURN a
        """

        params = {
            "uid": uid,
            "type": actor.type.value,
            "name": actor.name,
            "email": actor.email,
            "description": actor.description,
            "metadata": json.dumps(actor.metadata),
            "created_at": now,
            "updated_at": now,
        }

        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
            if record is None:
                raise RuntimeError("Failed to create actor")
            return _node_to_actor(dict(record["a"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if record is None:
                raise RuntimeError("Failed to create actor")
            return _node_to_actor(dict(record["a"]))

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> ActorResponse | None:
        """Get an actor by its UID.

        Args:
            uid: The unique identifier of the actor.
            tx: Optional transaction context.

        Returns:
            The actor response if found, None otherwise.
        """
        query = """
            MATCH (a:Actor {uid: $uid})
            RETURN a
        """

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_actor(dict(record["a"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_actor(dict(record["a"]))

    async def list(
        self,
        actor_type: ActorType | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[ActorResponse], int]:
        """List actors with optional filtering.

        Args:
            actor_type: Optional type filter.
            limit: Maximum number of items to return.
            offset: Number of items to skip.
            tx: Optional transaction context.

        Returns:
            Tuple of (items, total_count).
        """
        where_clause = ""
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if actor_type:
            where_clause = "WHERE a.type = $type"
            params["type"] = actor_type.value

        query = f"""
            MATCH (a:Actor)
            {where_clause}
            RETURN a
            ORDER BY a.created_at DESC
            SKIP $offset
            LIMIT $limit
        """

        count_query = f"""
            MATCH (a:Actor)
            {where_clause}
            RETURN count(a) as total
        """

        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
            items = [_node_to_actor(dict(r["a"])) for r in records]

            count_result = await tx.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            records = await result.data()
            items = [_node_to_actor(dict(r["a"])) for r in records]

            count_result = await session.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

    async def update(
        self,
        uid: str,
        actor: ActorUpdate,
        tx: ExecutionContext | None = None,
    ) -> ActorResponse | None:
        """Update an existing actor.

        Args:
            uid: The unique identifier of the actor.
            actor: The update data.
            tx: Optional transaction context.

        Returns:
            The updated actor response if found, None otherwise.
        """
        set_parts = ["a.updated_at = $updated_at"]
        params: dict[str, Any] = {
            "uid": uid,
            "updated_at": datetime.now(UTC),
        }

        if actor.name is not None:
            set_parts.append("a.name = $name")
            params["name"] = actor.name

        if actor.email is not None:
            set_parts.append("a.email = $email")
            params["email"] = actor.email

        if actor.description is not None:
            set_parts.append("a.description = $description")
            params["description"] = actor.description

        if actor.metadata is not None:
            set_parts.append("a.metadata = $metadata")
            params["metadata"] = json.dumps(actor.metadata)

        set_clause = ", ".join(set_parts)

        query = f"""
            MATCH (a:Actor {{uid: $uid}})
            SET {set_clause}
            RETURN a
        """

        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
            if record is None:
                return None
            return _node_to_actor(dict(record["a"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if record is None:
                return None
            return _node_to_actor(dict(record["a"]))

    async def delete(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> bool:
        """Delete an actor by UID.

        Args:
            uid: The unique identifier of the actor.
            tx: Optional transaction context.

        Returns:
            True if deleted, False if not found.
        """
        query = """
            MATCH (a:Actor {uid: $uid})
            DETACH DELETE a
            RETURN count(a) as deleted
        """

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            return record is not None and record["deleted"] > 0

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            return record is not None and record["deleted"] > 0
