"""Event repository for Neo4j operations."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from holocron.api.schemas.events import EntityType, EventAction, EventResponse
from holocron.db.connection import neo4j_driver
from holocron.db.utils import ExecutionContext, neo4j_datetime_to_python


def _node_to_event(node: dict[str, Any]) -> EventResponse:
    """Convert Neo4j node to EventResponse."""
    changes = node.get("changes", "{}")
    if isinstance(changes, str):
        changes = json.loads(changes) if changes else {}

    metadata = node.get("metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else {}

    return EventResponse(
        uid=node["uid"],
        action=EventAction(node["action"]),
        entity_type=EntityType(node["entity_type"]),
        entity_uid=node["entity_uid"],
        actor_uid=node.get("actor_uid"),
        timestamp=neo4j_datetime_to_python(node["timestamp"]),
        changes=changes,
        metadata=metadata,
    )


class EventRepository:
    """Repository for Event operations in Neo4j."""

    async def log(
        self,
        action: EventAction,
        entity_type: EntityType,
        entity_uid: str,
        actor_uid: str | None = None,
        changes: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        tx: ExecutionContext | None = None,
    ) -> EventResponse:
        """Log a new event.

        Args:
            action: The action performed.
            entity_type: The type of entity affected.
            entity_uid: The UID of the affected entity.
            actor_uid: Optional UID of the actor who performed the action.
            changes: Optional dict of changes made.
            metadata: Optional additional metadata.
            tx: Optional transaction context. If None, creates its own session.

        Returns:
            The created event response.
        """
        uid = f"evt-{uuid4()}"
        now = datetime.now(UTC)

        query = """
            CREATE (e:Event {
                uid: $uid,
                action: $action,
                entity_type: $entity_type,
                entity_uid: $entity_uid,
                actor_uid: $actor_uid,
                timestamp: $timestamp,
                changes: $changes,
                metadata: $metadata
            })
            RETURN e
        """

        params = {
            "uid": uid,
            "action": action.value,
            "entity_type": entity_type.value,
            "entity_uid": entity_uid,
            "actor_uid": actor_uid,
            "timestamp": now,
            "changes": json.dumps(changes or {}),
            "metadata": json.dumps(metadata or {}),
        }

        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
            if record is None:
                raise RuntimeError("Failed to create event")
            return _node_to_event(dict(record["e"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if record is None:
                raise RuntimeError("Failed to create event")
            return _node_to_event(dict(record["e"]))

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> EventResponse | None:
        """Get an event by its UID.

        Args:
            uid: The unique identifier of the event.
            tx: Optional transaction context.

        Returns:
            The event response if found, None otherwise.
        """
        query = """
            MATCH (e:Event {uid: $uid})
            RETURN e
        """

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_event(dict(record["e"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_event(dict(record["e"]))

    async def list(
        self,
        entity_type: EntityType | None = None,
        entity_uid: str | None = None,
        action: EventAction | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[EventResponse], int]:
        """List events with optional filtering.

        Args:
            entity_type: Optional entity type filter.
            entity_uid: Optional entity UID filter.
            action: Optional action filter.
            limit: Maximum number of items to return.
            offset: Number of items to skip.
            tx: Optional transaction context.

        Returns:
            Tuple of (items, total_count).
        """
        where_parts: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if entity_type:
            where_parts.append("e.entity_type = $entity_type")
            params["entity_type"] = entity_type.value

        if entity_uid:
            where_parts.append("e.entity_uid = $entity_uid")
            params["entity_uid"] = entity_uid

        if action:
            where_parts.append("e.action = $action")
            params["action"] = action.value

        where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        query = f"""
            MATCH (e:Event)
            {where_clause}
            RETURN e
            ORDER BY e.timestamp DESC
            SKIP $offset
            LIMIT $limit
        """

        count_query = f"""
            MATCH (e:Event)
            {where_clause}
            RETURN count(e) as total
        """

        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
            items = [_node_to_event(dict(r["e"])) for r in records]

            count_result = await tx.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

        async with neo4j_driver.session() as session:
            # Get items
            result = await session.run(query, params)
            records = await result.data()
            items = [_node_to_event(dict(r["e"])) for r in records]

            # Get total count
            count_result = await session.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total
