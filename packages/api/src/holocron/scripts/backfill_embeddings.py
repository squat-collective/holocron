"""Batch-embed every node (asset / actor / rule) that doesn't already have
an embedding.

Run from the API container:

    # All three kinds (default)
    podman exec holocron python -m holocron.scripts.backfill_embeddings

    # One kind
    podman exec holocron python -m holocron.scripts.backfill_embeddings --kind actor

    # Re-embed everything (e.g. after changing the canonical text builder)
    podman exec holocron python -m holocron.scripts.backfill_embeddings --force

Idempotent by default: only touches rows where `n.embedding IS NULL`.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from typing import Any, Callable

from holocron.core.services.embedding_service import (
    EmbeddingService,
    actor_embedding_text,
    asset_embedding_text,
    rule_embedding_text,
)
from holocron.db.connection import neo4j_driver

logger = logging.getLogger("backfill.embeddings")
_BATCH = 32


# Each kind maps to: Cypher label, the fields we pull, and the text builder.
_KIND_CONFIG: dict[str, dict[str, Any]] = {
    "asset": {
        "label": "Asset",
        "fields": "a.uid AS uid, a.name AS name, a.description AS description, "
        "a.type AS type, a.location AS location",
        "text": lambda r: asset_embedding_text(
            r["name"], r.get("description"), r.get("type"), r.get("location")
        ),
    },
    "actor": {
        "label": "Actor",
        "fields": "a.uid AS uid, a.name AS name, a.description AS description, "
        "a.type AS type, a.email AS email",
        "text": lambda r: actor_embedding_text(
            r["name"], r.get("description"), r.get("type"), r.get("email")
        ),
    },
    "rule": {
        "label": "Rule",
        "fields": "a.uid AS uid, a.name AS name, a.description AS description, "
        "a.severity AS severity, a.category AS category",
        "text": lambda r: rule_embedding_text(
            r["name"], r.get("description"), r.get("severity"), r.get("category")
        ),
    },
}


async def _fetch_batch(
    label: str, fields: str, force: bool, limit: int
) -> list[dict[str, Any]]:
    """Pull the next chunk of nodes that still need an embedding."""
    where = "WHERE a.embedding IS NULL" if not force else ""
    query = f"""
        MATCH (a:{label})
        {where}
        RETURN {fields}
        LIMIT $limit
    """
    async with neo4j_driver.session() as session:
        result = await session.run(query, {"limit": limit})
        return [dict(r) async for r in result]


async def _write_embeddings(label: str, rows: list[tuple[str, list[float]]]) -> None:
    """Bulk-write a batch of (uid, vector) pairs back to Neo4j."""
    if not rows:
        return
    query = f"""
        UNWIND $rows AS row
        MATCH (a:{label} {{uid: row.uid}})
        CALL db.create.setNodeVectorProperty(a, 'embedding', row.vector)
    """
    params = {"rows": [{"uid": uid, "vector": v} for uid, v in rows]}
    async with neo4j_driver.session() as session:
        await session.run(query, params)


async def _clear_embeddings(label: str) -> None:
    """Drop every `embedding` property on nodes of this label so the
    IS NULL filter below picks them up on the next pass."""
    async with neo4j_driver.session() as session:
        await session.run(f"MATCH (a:{label}) REMOVE a.embedding")


async def _backfill_kind(kind: str, force: bool) -> int:
    cfg = _KIND_CONFIG[kind]
    label: str = cfg["label"]
    fields: str = cfg["fields"]
    builder: Callable[[dict[str, Any]], str] = cfg["text"]

    # --force: wipe existing embeddings first, then let the IS NULL loop
    # walk the whole set. Avoids having to paginate via SKIP while keeping
    # the idempotent WHERE a.embedding IS NULL filter for the happy path.
    if force:
        logger.info("[%s] --force: clearing existing embeddings", kind)
        await _clear_embeddings(label)

    svc = EmbeddingService.instance()
    total = 0
    while True:
        batch = await _fetch_batch(label, fields, force=False, limit=_BATCH)
        if not batch:
            break
        texts = [builder(r) for r in batch]
        vectors = svc.embed_many(texts)
        rows = list(zip([r["uid"] for r in batch], vectors, strict=True))
        await _write_embeddings(label, rows)
        total += len(rows)
        logger.info("[%s] embedded %d (batch of %d)", kind, total, len(rows))
    logger.info("[%s] done — %d nodes embedded", kind, total)
    return total


async def backfill(kinds: list[str], force: bool) -> None:
    for k in kinds:
        await _backfill_kind(k, force=force)


async def _main(kinds: list[str], force: bool) -> None:
    await neo4j_driver.connect()
    try:
        await backfill(kinds, force=force)
    finally:
        await neo4j_driver.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--kind",
        choices=["asset", "actor", "rule", "all"],
        default="all",
        help="Which entity kind to backfill. Default: all.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed every node even if it already has an embedding.",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    kinds = (
        ["asset", "actor", "rule"]
        if args.kind == "all"
        else [args.kind]
    )
    asyncio.run(_main(kinds=kinds, force=args.force))


if __name__ == "__main__":
    main()
