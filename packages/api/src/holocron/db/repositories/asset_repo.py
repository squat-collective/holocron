"""Asset repository for Neo4j operations."""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from neo4j.exceptions import ConstraintError

from holocron.api.schemas.assets import AssetCreate, AssetResponse, AssetType, AssetUpdate
from holocron.core.exceptions import DuplicateError
from holocron.db.connection import neo4j_driver
from holocron.db.utils import (
    ExecutionContext,
    lucene_query,
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
        verified=node.get("verified", True),
        discovered_by=node.get("discovered_by"),
        metadata=metadata,
        created_at=neo4j_datetime_to_python(node["created_at"]),
        updated_at=neo4j_datetime_to_python(node["updated_at"]),
    )


class AssetRepository:
    """Repository for Asset CRUD operations in Neo4j."""

    async def set_embedding(
        self,
        uid: str,
        vector: list[float],
        tx: ExecutionContext | None = None,
    ) -> None:
        """Persist a vector embedding on an asset node.

        Uses `db.create.setNodeVectorProperty` so the value is stored in the
        native vector format and picked up by the vector index without
        further coercion.
        """
        query = """
            MATCH (a:Asset {uid: $uid})
            CALL db.create.setNodeVectorProperty(a, 'embedding', $vector)
            RETURN a.uid AS uid
        """
        params = {"uid": uid, "vector": vector}
        if tx is not None:
            await tx.run(query, params)
            return
        async with neo4j_driver.session() as session:
            await session.run(query, params)

    async def search_by_text(
        self,
        query: str,
        limit: int = 20,
    ) -> list[tuple[AssetResponse, float]]:
        """Full-text keyword search over name + description.

        Uses Neo4j's Lucene-backed fulltext index so exact + prefix + fuzzy
        matches all score appropriately. `query` is passed through as a
        Lucene expression — we wrap each bare word in `*` for prefix
        matching so short typed queries still hit. Returns empty list on
        parser errors (malformed Lucene syntax from the user).
        """
        lucene = lucene_query(query)
        if not lucene:
            return []
        cypher = """
            CALL db.index.fulltext.queryNodes('asset_text', $lucene, {limit: $limit})
            YIELD node, score
            RETURN node AS a, score
        """
        params: dict[str, Any] = {"lucene": lucene, "limit": limit}
        try:
            async with neo4j_driver.session() as session:
                result = await session.run(cypher, params)
                records = await result.data()
        except Exception:
            return []
        out: list[tuple[AssetResponse, float]] = []
        for rec in records:
            node = rec["a"]
            if node is None:
                continue
            out.append((_node_to_asset(dict(node)), float(rec["score"])))
        return out

    async def search_by_vector(
        self,
        vector: list[float],
        limit: int = 20,
    ) -> list[tuple[AssetResponse, float]]:
        """Return the top-K assets by cosine similarity.

        Score is 0..1 (higher = closer). Assets without an embedding are
        skipped — they're not in the vector index, so the query simply
        doesn't return them.
        """
        query = """
            CALL db.index.vector.queryNodes('asset_embedding', $limit, $vector)
            YIELD node, score
            RETURN node AS a, score
        """
        params: dict[str, Any] = {"limit": limit, "vector": vector}
        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            records = await result.data()
        out: list[tuple[AssetResponse, float]] = []
        for rec in records:
            node = rec["a"]
            score = rec["score"]
            if node is None:
                continue
            out.append((_node_to_asset(dict(node)), float(score)))
        return out

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
        uid = asset.uid or str(uuid4())
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
                verified: $verified,
                discovered_by: $discovered_by,
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
            "verified": asset.verified,
            "discovered_by": asset.discovered_by,
            "metadata": json.dumps(asset.metadata),
            "created_at": now,
            "updated_at": now,
        }

        try:
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
        except ConstraintError as e:
            raise DuplicateError(f"Asset with uid '{uid}' already exists") from e

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
        verified: bool | None = None,
        has_owner: bool | None = None,
        has_description: bool | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[AssetResponse], int]:
        """List assets with optional filtering.

        Args:
            asset_type: Optional type filter.
            verified: Optional verification-state filter.
            has_owner: Optional filter on whether at least one incoming
                `owns` relation exists. True → assets with an owner; False →
                orphan assets; None → don't filter.
            has_description: Optional filter on description presence.
                None and empty-string descriptions both count as missing.
            limit: Maximum number of items to return.
            offset: Number of items to skip.
            tx: Optional transaction context.

        Returns:
            Tuple of (items, total_count).
        """
        # Build the WHERE clause incrementally — keeps the resulting Cypher
        # readable and lets us run with no filters at all.
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if asset_type:
            clauses.append("a.type = $type")
            params["type"] = asset_type.value

        if verified is not None:
            # `verified` defaults to True on assets created without the
            # field, but the Cypher coalesce keeps the filter robust against
            # legacy nodes that pre-date the property.
            clauses.append("coalesce(a.verified, true) = $verified")
            params["verified"] = verified

        if has_description is not None:
            if has_description:
                clauses.append("a.description IS NOT NULL AND a.description <> ''")
            else:
                clauses.append("(a.description IS NULL OR a.description = '')")

        if has_owner is not None:
            # An "owner" is any actor with an `owns` relation pointing at
            # the asset. EXISTS subquery keeps this expressible inside a
            # WHERE clause without adding to the row product.
            if has_owner:
                clauses.append("EXISTS { MATCH (:Actor)-[:owns]->(a) }")
            else:
                clauses.append("NOT EXISTS { MATCH (:Actor)-[:owns]->(a) }")

        where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""

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

        if asset.verified is not None:
            set_parts.append("a.verified = $verified")
            params["verified"] = asset.verified

        if asset.discovered_by is not None:
            set_parts.append("a.discovered_by = $discovered_by")
            params["discovered_by"] = asset.discovered_by

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

    async def get_descendants(
        self,
        uid: str,
        depth: int,
        tx: ExecutionContext | None = None,
    ) -> Sequence[tuple[str, AssetResponse]]:
        """Walk `CONTAINS` edges from the root asset up to `depth` levels.

        Returns a flat list of `(parent_uid, child_asset)` tuples ordered
        by ascending depth so the caller can rebuild the tree without
        re-sorting. Edges that point at non-:Asset nodes (the
        :Container/:Field schema projection) are filtered out so a tree
        of authored hierarchical assets stays clean.

        Args:
            uid: UID of the root asset.
            depth: Maximum number of CONTAINS hops to traverse (>= 1).
            tx: Optional transaction context.
        """
        if depth < 1:
            return []
        query = """
            MATCH path = (root:Asset {uid: $uid})-[:CONTAINS*1..]->(child:Asset)
            WHERE length(path) <= $depth
            WITH child, length(path) AS depth, nodes(path) AS chain
            RETURN
                chain[size(chain) - 2].uid AS parent_uid,
                child AS a,
                depth
            ORDER BY depth, child.created_at
        """
        params = {"uid": uid, "depth": depth}
        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                records = await result.data()
        out: list[tuple[str, AssetResponse]] = []
        for rec in records:
            node = rec["a"]
            if node is None:
                continue
            out.append((rec["parent_uid"], _node_to_asset(dict(node))))
        return out

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
