"""Asset repository for Neo4j operations."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from holocron.api.schemas.assets import AssetCreate, AssetResponse, AssetType, AssetUpdate
from holocron.db.connection import neo4j_driver
from holocron.db.utils import (
    ExecutionContext,
    neo4j_datetime_to_python,
    validate_node_label,
)


def _node_to_asset(node: dict[str, Any]) -> AssetResponse:
    """Convert Neo4j node to AssetResponse."""
    metadata = node.get("metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else {}

    return AssetResponse(
        uid=node["uid"],
        type=AssetType(node["type"]),
        name=node["name"],
        description=node.get("description"),
        location=node.get("location"),
        status=node["status"],
        metadata=metadata,
        created_at=neo4j_datetime_to_python(node["created_at"]),
        updated_at=neo4j_datetime_to_python(node["updated_at"]),
    )


class AssetRepository:
    """Repository for Asset CRUD operations in Neo4j."""

    async def create(
        self,
        asset: AssetCreate,
        tx: ExecutionContext | None = None,
    ) -> AssetResponse:
        """Create a new asset in Neo4j.

        Args:
            asset: The asset data to create.
            tx: Optional transaction context. If None, creates its own session.

        Returns:
            The created asset response.
        """
        uid = str(uuid4())
        now = datetime.now(UTC)
        label = validate_node_label(asset.type.value.capitalize())

        query = f"""
            CREATE (a:Asset:{label} {{
                uid: $uid,
                type: $type,
                name: $name,
                description: $description,
                location: $location,
                status: $status,
                metadata: $metadata,
                created_at: $created_at,
                updated_at: $updated_at
            }})
            RETURN a
        """

        params = {
            "uid": uid,
            "type": asset.type.value,
            "name": asset.name,
            "description": asset.description,
            "location": asset.location,
            "status": asset.status.value,
            "metadata": json.dumps(asset.metadata),
            "created_at": now,
            "updated_at": now,
        }

        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
            if record is None:
                raise RuntimeError("Failed to create asset")
            return _node_to_asset(dict(record["a"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if record is None:
                raise RuntimeError("Failed to create asset")
            return _node_to_asset(dict(record["a"]))

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> AssetResponse | None:
        """Get an asset by its UID.

        Args:
            uid: The unique identifier of the asset.
            tx: Optional transaction context.

        Returns:
            The asset response if found, None otherwise.
        """
        query = """
            MATCH (a:Asset {uid: $uid})
            RETURN a
        """

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_asset(dict(record["a"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_asset(dict(record["a"]))

    async def list(
        self,
        asset_type: AssetType | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[AssetResponse], int]:
        """List assets with optional filtering.

        Args:
            asset_type: Optional type filter.
            limit: Maximum number of items to return.
            offset: Number of items to skip.
            tx: Optional transaction context.

        Returns:
            Tuple of (items, total_count).
        """
        # Build query based on filters
        where_clause = ""
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if asset_type:
            where_clause = "WHERE a.type = $type"
            params["type"] = asset_type.value

        query = f"""
            MATCH (a:Asset)
            {where_clause}
            RETURN a
            ORDER BY a.created_at DESC
            SKIP $offset
            LIMIT $limit
        """

        count_query = f"""
            MATCH (a:Asset)
            {where_clause}
            RETURN count(a) as total
        """

        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
            items = [_node_to_asset(dict(r["a"])) for r in records]

            count_result = await tx.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

        async with neo4j_driver.session() as session:
            # Get items
            result = await session.run(query, params)
            records = await result.data()
            items = [_node_to_asset(dict(r["a"])) for r in records]

            # Get total count
            count_result = await session.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

    async def update(
        self,
        uid: str,
        asset: AssetUpdate,
        tx: ExecutionContext | None = None,
    ) -> AssetResponse | None:
        """Update an existing asset.

        Args:
            uid: The unique identifier of the asset.
            asset: The update data.
            tx: Optional transaction context.

        Returns:
            The updated asset response if found, None otherwise.
        """
        # Build SET clause dynamically based on provided fields
        set_parts = ["a.updated_at = $updated_at"]
        params: dict[str, Any] = {
            "uid": uid,
            "updated_at": datetime.now(UTC),
        }

        if asset.name is not None:
            set_parts.append("a.name = $name")
            params["name"] = asset.name

        if asset.description is not None:
            set_parts.append("a.description = $description")
            params["description"] = asset.description

        if asset.location is not None:
            set_parts.append("a.location = $location")
            params["location"] = asset.location

        if asset.status is not None:
            set_parts.append("a.status = $status")
            params["status"] = asset.status.value

        if asset.metadata is not None:
            set_parts.append("a.metadata = $metadata")
            params["metadata"] = json.dumps(asset.metadata)

        set_clause = ", ".join(set_parts)

        query = f"""
            MATCH (a:Asset {{uid: $uid}})
            SET {set_clause}
            RETURN a
        """

        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
            if record is None:
                return None
            return _node_to_asset(dict(record["a"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if record is None:
                return None
            return _node_to_asset(dict(record["a"]))

    async def delete(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> bool:
        """Delete an asset by UID.

        Args:
            uid: The unique identifier of the asset.
            tx: Optional transaction context.

        Returns:
            True if deleted, False if not found.
        """
        query = """
            MATCH (a:Asset {uid: $uid})
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
