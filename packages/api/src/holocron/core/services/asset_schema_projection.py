"""Project an asset's `metadata.schema` JSON tree into a real Neo4j
projection of (:Container) / (:Field) nodes connected via CONTAINS edges.

The JSON under `asset.metadata.schema` is the source of truth for the
tree; editing is a single PUT on the asset. But querying column / table
data through pure Python walks doesn't scale, so we maintain a real
graph projection: (:Asset)-[:CONTAINS]->(:Container|:Field) with more
:CONTAINS edges going deeper. Every write fully rebuilds the projection
for that asset, which is cheap relative to the embedding cost and
avoids fiddly incremental diffing.

These functions are stateless and operate on a Neo4j transaction passed
by the caller, so they can be reused outside `AssetService` (e.g. by
the seed script).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from holocron.api.schemas.assets import AssetResponse
from holocron.core.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


async def tear_down_schema(asset_uid: str, tx: Any) -> None:
    """Remove every :Container / :Field projection node reachable from an asset.

    The `NOT n:Asset` guard matters since `column` and `field` AssetTypes
    write the labels `:Asset:Column` / `:Asset:Field`, which would
    otherwise collide with projection nodes carrying `:Field`.
    """
    await tx.run(
        """
        MATCH (a:Asset {uid: $uid})-[:CONTAINS*1..]->(n)
        WHERE (n:Container OR n:Field) AND NOT n:Asset
        DETACH DELETE n
        """,
        {"uid": asset_uid},
    )


async def materialize_schema(asset: AssetResponse, tx: Any) -> None:
    """Rebuild the :Container/:Field projection for this asset.

    Best-effort: if embedding fails we still write the node so FTS keeps
    working; we just log and continue. Walks the JSON tree and creates a
    CONTAINS chain per node, denormalising name / path / asset_uid /
    asset_name onto each node so search results can be rendered without
    a join back to the asset.
    """
    await tear_down_schema(asset.uid, tx=tx)
    schema = (
        asset.metadata.get("schema") if isinstance(asset.metadata, dict) else None
    )
    if not isinstance(schema, list) or not schema:
        return
    try:
        svc: Any = EmbeddingService.instance()
    except Exception:
        logger.exception("Embedding service unavailable; projecting without vectors")
        svc = None

    await _materialize_nodes(
        parent_uid=asset.uid,
        nodes=schema,
        path_prefix=[],
        asset_uid=asset.uid,
        asset_name=asset.name,
        svc=svc,
        tx=tx,
    )


async def _materialize_nodes(
    *,
    parent_uid: str,
    nodes: list[Any],
    path_prefix: list[str],
    asset_uid: str,
    asset_name: str,
    svc: Any,
    tx: Any,
) -> None:
    """Recursive walker — creates one :Container or :Field per JSON
    node, chained via CONTAINS from the parent. The MATCH on `{uid:
    $parent_uid}` works whether the parent is the :Asset itself or
    another :Container, so no per-level branching is needed."""
    for raw in nodes:
        if not isinstance(raw, dict):
            continue
        name = raw.get("name")
        if not isinstance(name, str) or not name:
            continue
        node_type = raw.get("nodeType")
        description = raw.get("description")
        path = [*path_prefix, name]
        path_str = " / ".join(path)
        node_uid = f"sn-{uuid4()}"

        label = "Container" if node_type == "container" else "Field"
        extras: dict[str, Any] = {}
        if node_type == "container":
            ct = raw.get("containerType")
            extras["container_type"] = ct if isinstance(ct, str) else None
        else:
            dt = raw.get("dataType")
            extras["data_type"] = dt if isinstance(dt, str) else None
            pii = raw.get("pii")
            extras["pii"] = bool(pii) if isinstance(pii, bool) else False

        # Compute embedding from name + description + path so semantic
        # queries on column concepts ("email address", "revenue") still
        # hit even when the field's literal name is something cryptic.
        embedding: list[float] | None = None
        if svc is not None:
            try:
                embed_text = ". ".join(
                    [
                        name,
                        path_str,
                        description or "",
                        extras.get("container_type") or extras.get("data_type") or "",
                    ]
                ).strip()
                embedding = svc.embed_one(embed_text)
            except Exception:
                logger.exception("Failed to embed %s %s; skipping vector", label, name)

        create_query = f"""
            MATCH (p {{uid: $parent_uid}})
            CREATE (n:{label} {{
                uid: $uid,
                name: $name,
                description: $description,
                path: $path,
                asset_uid: $asset_uid,
                asset_name: $asset_name
            }})
            SET n += $extras
            MERGE (p)-[:CONTAINS]->(n)
        """
        await tx.run(
            create_query,
            {
                "parent_uid": parent_uid,
                "uid": node_uid,
                "name": name,
                "description": description if isinstance(description, str) else None,
                "path": path_str,
                "asset_uid": asset_uid,
                "asset_name": asset_name,
                "extras": extras,
            },
        )
        if embedding is not None:
            await tx.run(
                f"""
                MATCH (n:{label} {{uid: $uid}})
                CALL db.create.setNodeVectorProperty(n, 'embedding', $vector)
                RETURN n.uid AS uid
                """,
                {"uid": node_uid, "vector": embedding},
            )

        children = raw.get("children")
        if isinstance(children, list) and children:
            await _materialize_nodes(
                parent_uid=node_uid,
                nodes=children,
                path_prefix=path,
                asset_uid=asset_uid,
                asset_name=asset_name,
                svc=svc,
                tx=tx,
            )
