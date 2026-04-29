"""Term repository for Neo4j operations.

A `Term` is a Business Glossary entry — a named, defined business
concept ("Active Customer", "Revenue") that wires into the catalog
through a `Term -[:DEFINES]-> Asset` edge. Terms are first-class
nodes; the relations API handles all term↔asset / term↔term linkage,
this repo only owns the node CRUD itself.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from neo4j.exceptions import ConstraintError

from holocron.api.schemas.terms import (
    TermCreate,
    TermResponse,
    TermStatus,
    TermUpdate,
)
from holocron.core.exceptions import DuplicateError
from holocron.db.connection import neo4j_driver
from holocron.db.utils import (
    ExecutionContext,
    neo4j_datetime_to_python,
)


def _node_to_term(node: dict[str, Any]) -> TermResponse:
    """Convert a Neo4j node to a TermResponse.

    `metadata` lands as a JSON string on the node (Neo4j has no native
    map storage we can index against), so it always needs decoding here.
    """
    metadata = node.get("metadata", "{}")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else {}

    return TermResponse(
        uid=node["uid"],
        name=node["name"],
        definition=node["definition"],
        domain=node.get("domain"),
        status=TermStatus(node.get("status", "draft")),
        formula=node.get("formula"),
        unit=node.get("unit"),
        pii=node.get("pii", False),
        verified=node.get("verified", True),
        discovered_by=node.get("discovered_by"),
        metadata=metadata,
        created_at=neo4j_datetime_to_python(node["created_at"]),
        updated_at=neo4j_datetime_to_python(node["updated_at"]),
    )


class TermRepository:
    """CRUD for :Term nodes."""

    async def create(
        self,
        term: TermCreate,
        tx: ExecutionContext | None = None,
    ) -> TermResponse:
        """Create a new term."""
        uid = term.uid or str(uuid4())
        now = datetime.now(UTC)
        query = """
            CREATE (t:Term {
                uid: $uid,
                name: $name,
                definition: $definition,
                domain: $domain,
                status: $status,
                formula: $formula,
                unit: $unit,
                pii: $pii,
                verified: $verified,
                discovered_by: $discovered_by,
                metadata: $metadata,
                created_at: $created_at,
                updated_at: $updated_at
            })
            RETURN t
        """
        params = {
            "uid": uid,
            "name": term.name,
            "definition": term.definition,
            "domain": term.domain,
            "status": term.status.value,
            "formula": term.formula,
            "unit": term.unit,
            "pii": term.pii,
            "verified": term.verified,
            "discovered_by": term.discovered_by,
            "metadata": json.dumps(term.metadata),
            "created_at": now,
            "updated_at": now,
        }
        try:
            if tx is not None:
                result = await tx.run(query, params)
                record = await result.single()
                if record is None:
                    raise RuntimeError("Failed to create term")
                return _node_to_term(dict(record["t"]))
            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                record = await result.single()
                if record is None:
                    raise RuntimeError("Failed to create term")
                return _node_to_term(dict(record["t"]))
        except ConstraintError as e:
            raise DuplicateError(f"Term with uid '{uid}' already exists") from e

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> TermResponse | None:
        """Get a single term by UID, or None if missing."""
        query = "MATCH (t:Term {uid: $uid}) RETURN t"
        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, {"uid": uid})
                record = await result.single()
        if record is None:
            return None
        return _node_to_term(dict(record["t"]))

    async def list(
        self,
        domain: str | None = None,
        status: TermStatus | None = None,
        pii: bool | None = None,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[Sequence[TermResponse], int]:
        """List terms with optional filters.

        Filters AND together. `domain` is an exact match because the
        field is free-form and unindexed; substring search belongs in
        the search endpoint, not here.
        """
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if domain is not None:
            clauses.append("t.domain = $domain")
            params["domain"] = domain
        if status is not None:
            clauses.append("t.status = $status")
            params["status"] = status.value
        if pii is not None:
            clauses.append("coalesce(t.pii, false) = $pii")
            params["pii"] = pii
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        query = f"""
            MATCH (t:Term)
            {where}
            RETURN t
            ORDER BY t.created_at DESC
            SKIP $offset
            LIMIT $limit
        """
        count_query = f"MATCH (t:Term) {where} RETURN count(t) AS total"
        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
            count_result = await tx.run(count_query, params)
            count_record = await count_result.single()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                records = await result.data()
                count_result = await session.run(count_query, params)
                count_record = await count_result.single()
        items = [_node_to_term(dict(r["t"])) for r in records]
        total = count_record["total"] if count_record else 0
        return items, total

    async def update(
        self,
        uid: str,
        term: TermUpdate,
        tx: ExecutionContext | None = None,
    ) -> TermResponse | None:
        """Apply a partial update to a term. Returns None if not found."""
        set_parts = ["t.updated_at = $updated_at"]
        params: dict[str, Any] = {"uid": uid, "updated_at": datetime.now(UTC)}
        if term.name is not None:
            set_parts.append("t.name = $name")
            params["name"] = term.name
        if term.definition is not None:
            set_parts.append("t.definition = $definition")
            params["definition"] = term.definition
        if term.domain is not None:
            set_parts.append("t.domain = $domain")
            params["domain"] = term.domain
        if term.status is not None:
            set_parts.append("t.status = $status")
            params["status"] = term.status.value
        if term.formula is not None:
            set_parts.append("t.formula = $formula")
            params["formula"] = term.formula
        if term.unit is not None:
            set_parts.append("t.unit = $unit")
            params["unit"] = term.unit
        if term.pii is not None:
            set_parts.append("t.pii = $pii")
            params["pii"] = term.pii
        if term.verified is not None:
            set_parts.append("t.verified = $verified")
            params["verified"] = term.verified
        if term.discovered_by is not None:
            set_parts.append("t.discovered_by = $discovered_by")
            params["discovered_by"] = term.discovered_by
        if term.metadata is not None:
            set_parts.append("t.metadata = $metadata")
            params["metadata"] = json.dumps(term.metadata)

        query = f"""
            MATCH (t:Term {{uid: $uid}})
            SET {', '.join(set_parts)}
            RETURN t
        """
        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                record = await result.single()
        if record is None:
            return None
        return _node_to_term(dict(record["t"]))

    async def delete(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> bool:
        """Delete a term + all its incident relations. Returns True if removed."""
        query = """
            MATCH (t:Term {uid: $uid})
            DETACH DELETE t
            RETURN count(t) AS deleted
        """
        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            record = await result.single()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, {"uid": uid})
                record = await result.single()
        return record is not None and record["deleted"] > 0

    async def list_defined_assets(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> Sequence[dict[str, Any]]:
        """Return the asset uids/names that this term `DEFINES`."""
        query = """
            MATCH (t:Term {uid: $uid})-[:DEFINES]->(a:Asset)
            RETURN a.uid AS uid, a.name AS name, a.type AS type
            ORDER BY a.name
        """
        if tx is not None:
            result = await tx.run(query, {"uid": uid})
            records = await result.data()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, {"uid": uid})
                records = await result.data()
        return list(records)
