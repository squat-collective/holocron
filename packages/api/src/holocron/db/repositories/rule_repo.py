"""Rule repository for Neo4j operations."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from neo4j.exceptions import ConstraintError

from holocron.api.schemas.rules import (
    RuleCreate,
    RuleResponse,
    RuleSeverity,
    RuleUpdate,
)
from holocron.core.exceptions import DuplicateError
from holocron.db.connection import neo4j_driver
from holocron.db.utils import (
    ExecutionContext,
    lucene_query,
    neo4j_datetime_to_python,
)


def _node_to_rule(node: dict[str, Any]) -> RuleResponse:
    """Convert Neo4j node to RuleResponse."""
    metadata = node.get("metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else {}

    return RuleResponse(
        uid=node["uid"],
        name=node["name"],
        description=node["description"],
        severity=RuleSeverity(node.get("severity", "warning")),
        category=node.get("category"),
        verified=node.get("verified", True),
        discovered_by=node.get("discovered_by"),
        metadata=metadata,
        created_at=neo4j_datetime_to_python(node["created_at"]),
        updated_at=neo4j_datetime_to_python(node["updated_at"]),
    )


class RuleRepository:
    """Repository for Rule CRUD operations in Neo4j."""

    async def set_embedding(
        self,
        uid: str,
        vector: list[float],
        tx: ExecutionContext | None = None,
    ) -> None:
        """Persist a 384-dim BGE-small embedding on a rule node."""
        query = """
            MATCH (r:Rule {uid: $uid})
            CALL db.create.setNodeVectorProperty(r, 'embedding', $vector)
            RETURN r.uid AS uid
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
    ) -> list[tuple[RuleResponse, float]]:
        """Fulltext keyword search over rule name + description."""
        lucene = lucene_query(query)
        if not lucene:
            return []
        cypher = """
            CALL db.index.fulltext.queryNodes('rule_text', $lucene, {limit: $limit})
            YIELD node, score
            RETURN node AS r, score
        """
        params: dict[str, Any] = {"lucene": lucene, "limit": limit}
        try:
            async with neo4j_driver.session() as session:
                result = await session.run(cypher, params)
                records = await result.data()
        except Exception:
            return []
        out: list[tuple[RuleResponse, float]] = []
        for rec in records:
            node = rec["r"]
            if node is None:
                continue
            out.append((_node_to_rule(dict(node)), float(rec["score"])))
        return out

    async def search_by_vector(
        self,
        vector: list[float],
        limit: int = 20,
    ) -> list[tuple[RuleResponse, float]]:
        """Top-K rules by cosine similarity against `rule_embedding`."""
        query = """
            CALL db.index.vector.queryNodes('rule_embedding', $limit, $vector)
            YIELD node, score
            RETURN node AS r, score
        """
        params: dict[str, Any] = {"limit": limit, "vector": vector}
        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            records = await result.data()
        out: list[tuple[RuleResponse, float]] = []
        for rec in records:
            node = rec["r"]
            if node is None:
                continue
            out.append((_node_to_rule(dict(node)), float(rec["score"])))
        return out

    async def create(
        self,
        rule: RuleCreate,
        tx: ExecutionContext | None = None,
    ) -> RuleResponse:
        """Create a new rule in Neo4j."""
        uid = rule.uid or str(uuid4())
        now = datetime.now(UTC)

        query = """
            CREATE (r:Rule {
                uid: $uid,
                name: $name,
                description: $description,
                severity: $severity,
                category: $category,
                verified: $verified,
                discovered_by: $discovered_by,
                metadata: $metadata,
                created_at: $created_at,
                updated_at: $updated_at
            })
            RETURN r
        """

        params = {
            "uid": uid,
            "name": rule.name,
            "description": rule.description,
            "severity": rule.severity.value,
            "category": rule.category,
            "verified": rule.verified,
            "discovered_by": rule.discovered_by,
            "metadata": json.dumps(rule.metadata),
            "created_at": now,
            "updated_at": now,
        }

        try:
            if tx is not None:
                result = await tx.run(query, params)
                record = await result.single()
                if record is None:
                    raise RuntimeError("Failed to create rule")
                return _node_to_rule(dict(record["r"]))

            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                record = await result.single()
                if record is None:
                    raise RuntimeError("Failed to create rule")
                return _node_to_rule(dict(record["r"]))
        except ConstraintError as e:
            raise DuplicateError(f"Rule with uid '{uid}' already exists") from e

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> RuleResponse | None:
        query = "MATCH (r:Rule {uid: $uid}) RETURN r"

        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_rule(dict(record["r"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, {"uid": uid})
            record = await result.single()
            if record is None:
                return None
            return _node_to_rule(dict(record["r"]))

    async def list(
        self,
        category: str | None = None,
        severity: RuleSeverity | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[RuleResponse], int]:
        """List rules with optional filtering by category/severity."""
        where_parts: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if category:
            where_parts.append("r.category = $category")
            params["category"] = category
        if severity:
            where_parts.append("r.severity = $severity")
            params["severity"] = severity.value

        where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        query = f"""
            MATCH (r:Rule)
            {where_clause}
            RETURN r
            ORDER BY r.created_at DESC
            SKIP $offset
            LIMIT $limit
        """

        count_query = f"""
            MATCH (r:Rule)
            {where_clause}
            RETURN count(r) as total
        """

        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
            items = [_node_to_rule(dict(r["r"])) for r in records]

            count_result = await tx.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            records = await result.data()
            items = [_node_to_rule(dict(r["r"])) for r in records]

            count_result = await session.run(count_query, params)
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            return items, total

    async def list_for_asset(
        self,
        asset_uid: str,
        tx: ExecutionContext | None = None,
    ) -> list[tuple[RuleResponse, str, dict[str, Any]]]:
        """List all rules applied to a given asset, with the APPLIES_TO relation's uid + properties.

        Returns triples of (rule, relation_uid, {enforcement, field_path, ...}).
        The relation_uid is needed to detach without another lookup.
        """
        query = """
            MATCH (r:Rule)-[rel:APPLIES_TO]->(a {uid: $asset_uid})
            RETURN r, rel.uid as relation_uid, rel.properties as props
            ORDER BY r.created_at DESC
        """

        if tx is not None:
            result = await tx.run(query, {"asset_uid": asset_uid})
            records = await result.data()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, {"asset_uid": asset_uid})
                records = await result.data()

        out: list[tuple[RuleResponse, str, dict[str, Any]]] = []
        for rec in records:
            rule = _node_to_rule(dict(rec["r"]))
            props = rec.get("props") or "{}"
            if isinstance(props, str):
                props = json.loads(props) if props else {}
            out.append((rule, rec["relation_uid"], props))
        return out

    async def update(
        self,
        uid: str,
        rule: RuleUpdate,
        tx: ExecutionContext | None = None,
    ) -> RuleResponse | None:
        set_parts = ["r.updated_at = $updated_at"]
        params: dict[str, Any] = {
            "uid": uid,
            "updated_at": datetime.now(UTC),
        }

        if rule.name is not None:
            set_parts.append("r.name = $name")
            params["name"] = rule.name

        if rule.description is not None:
            set_parts.append("r.description = $description")
            params["description"] = rule.description

        if rule.severity is not None:
            set_parts.append("r.severity = $severity")
            params["severity"] = rule.severity.value

        if rule.category is not None:
            set_parts.append("r.category = $category")
            params["category"] = rule.category

        if rule.verified is not None:
            set_parts.append("r.verified = $verified")
            params["verified"] = rule.verified

        if rule.discovered_by is not None:
            set_parts.append("r.discovered_by = $discovered_by")
            params["discovered_by"] = rule.discovered_by

        if rule.metadata is not None:
            set_parts.append("r.metadata = $metadata")
            params["metadata"] = json.dumps(rule.metadata)

        set_clause = ", ".join(set_parts)

        query = f"""
            MATCH (r:Rule {{uid: $uid}})
            SET {set_clause}
            RETURN r
        """

        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
            if record is None:
                return None
            return _node_to_rule(dict(record["r"]))

        async with neo4j_driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if record is None:
                return None
            return _node_to_rule(dict(record["r"]))

    async def delete(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> bool:
        query = """
            MATCH (r:Rule {uid: $uid})
            DETACH DELETE r
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
