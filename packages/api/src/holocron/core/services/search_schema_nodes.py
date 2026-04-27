"""Hybrid search over the materialised :Container / :Field graph.

The asset's ``metadata.schema`` JSON is projected into real Neo4j nodes
by ``asset_schema_projection``; this module ranks those nodes using the
same vector + FTS fusion the entity rankers use.
"""

from __future__ import annotations

import logging
from typing import Any

from holocron.api.schemas.search import ContainerHit, FieldHit, SearchHit
from holocron.core.services.embedding_service import EmbeddingService
from holocron.core.services.search_scoring import (
    NEUTRAL_SCORE,
    PER_KIND_CAP,
    fold_fts,
    normalize_fts_score,
)
from holocron.db.connection import Neo4jDriver

logger = logging.getLogger(__name__)


async def rank_schema_nodes(
    driver: Neo4jDriver,
    kind: str,
    query: str,
) -> list[tuple[SearchHit, float]]:
    """Mirror of the asset/actor/rule rankers for schema nodes.

    Vector index ranks by cosine similarity; fulltext ranks by Lucene
    relevance; ``fold_fts`` merges the two so a literal column-name hit
    can surface even on a vague semantic query. Each row carries
    name/path/asset_uid denormalised so we can build a SearchHit without
    rejoining to the parent asset.
    """
    if kind == "container":
        label = "Container"
        vector_idx = "container_embedding"
        text_idx = "container_text"
    else:
        label = "Field"
        vector_idx = "field_embedding"
        text_idx = "field_text"

    async def _run_vector() -> list[tuple[dict[str, Any], float]]:
        if not query.strip():
            return []
        try:
            vec = EmbeddingService.instance().embed_one(query)
        except Exception:
            logger.exception("Embed failed for schema-node query '%s'", query)
            return []
        cypher = f"""
            CALL db.index.vector.queryNodes('{vector_idx}', $k, $v)
            YIELD node, score
            RETURN node AS n, score
        """
        async with driver.session() as session:
            res = await session.run(cypher, {"k": PER_KIND_CAP * 2, "v": vec})
            rows = await res.data()
        return [(r["n"], float(r["score"])) for r in rows if r["n"] is not None]

    async def _run_fts() -> list[tuple[dict[str, Any], float]]:
        from holocron.db.utils import lucene_query

        lucene = lucene_query(query)
        if not lucene:
            return []
        cypher = f"""
            CALL db.index.fulltext.queryNodes('{text_idx}', $q, {{limit: $k}})
            YIELD node, score
            RETURN node AS n, score
        """
        try:
            async with driver.session() as session:
                res = await session.run(
                    cypher, {"q": lucene, "k": PER_KIND_CAP * 2}
                )
                rows = await res.data()
        except Exception:
            return []
        return [(r["n"], float(r["score"])) for r in rows if r["n"] is not None]

    if not query.strip():
        # No bare text — e.g. `c:` alone. Return everything in name order
        # so the UI has something to show.
        cypher = f"""
            MATCH (n:{label})
            RETURN n
            ORDER BY n.asset_name, n.path
            LIMIT $k
        """
        async with driver.session() as session:
            res = await session.run(cypher, {"k": PER_KIND_CAP})
            rows = await res.data()
        bare_hits = {(r["n"])["uid"]: ((r["n"]), NEUTRAL_SCORE) for r in rows}
        return [
            (_schema_node_to_hit(label, node_dict), score)
            for _, (node_dict, score) in bare_hits.items()
        ]

    v_rows, f_rows = await _run_vector(), await _run_fts()

    vector_hits: dict[str, tuple[dict[str, Any], float]] = {
        n["uid"]: (n, s) for n, s in v_rows
    }
    fts_matches: dict[str, float] = {}
    for n, raw_score in f_rows:
        uid = n["uid"]
        norm = normalize_fts_score(raw_score)
        fts_matches[uid] = norm
        vector_hits.setdefault(uid, (n, 0.0))

    merged = fold_fts(vector_hits, fts_matches)
    return [
        (_schema_node_to_hit(label, node_dict), score)
        for node_dict, score in sorted(merged.values(), key=lambda t: -t[1])
    ]


def _schema_node_to_hit(label: str, node: dict[str, Any]) -> SearchHit:
    """Convert a raw :Container or :Field Neo4j record into a SearchHit."""
    common = {
        "asset_uid": node.get("asset_uid") or "",
        "asset_name": node.get("asset_name") or "",
        "name": node.get("name") or "",
        "path": node.get("path") or node.get("name") or "",
        "description": node.get("description"),
    }
    if label == "Container":
        return ContainerHit(
            **common,
            container_type=node.get("container_type"),
        )
    return FieldHit(
        **common,
        data_type=node.get("data_type"),
        pii=bool(node.get("pii")),
    )
