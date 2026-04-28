"""Tag aggregation endpoint.

`GET /tags` returns every distinct tag in use across all assets, with
catalog-wide usage counts. This is the data behind the asset-create
wizard's tag autosuggest — without it users keep typing inconsistent
spellings (`pii`, `PII`, `pii-data`) for the same conceptual tag.

Tags live inside `metadata.tags` (a JSON array), and `metadata` is
stored as a JSON-encoded string property on the Neo4j node — so
aggregation can't use Cypher's `UNWIND` directly. We pull every
asset's metadata, decode in Python, and tally. Acceptable at the
scale this catalog targets (low thousands of assets).
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from collections.abc import Iterable
from typing import Any

from fastapi import APIRouter

from holocron.api.dependencies import get_neo4j_driver
from holocron.api.schemas.tags import TagListResponse, TagUsage

router = APIRouter(prefix="/tags", tags=["tags"])

logger = logging.getLogger(__name__)


def aggregate_tags(metadatas: Iterable[Any]) -> TagListResponse:
    """Count tag usages across raw `metadata` values pulled from Neo4j.

    Pure function, decoupled from the driver so it can be unit-tested.
    Inputs are whatever the `a.metadata` property returns — typically
    a JSON-encoded string (the asset repo's storage shape) or `None`
    for assets without metadata. Anything that doesn't decode to a
    dict with a list under `tags` is silently skipped.

    Tags are normalised the same way the create wizard normalises them
    on input: trimmed, leading `#` stripped, lowercased. Empty results
    after normalisation are dropped.

    Output is sorted by count descending, then name ascending — most-
    used tags first, deterministic ordering across requests.
    """
    counts: Counter[str] = Counter()
    for raw in metadatas:
        if not raw:
            continue
        try:
            metadata = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            continue
        if not isinstance(metadata, dict):
            continue
        tags = metadata.get("tags")
        if not isinstance(tags, list):
            continue
        for tag in tags:
            if not isinstance(tag, str):
                continue
            normalised = tag.strip().lstrip("#").lower()
            if not normalised:
                continue
            counts[normalised] += 1

    items = [
        TagUsage(name=name, count=count)
        for name, count in sorted(
            counts.items(),
            key=lambda pair: (-pair[1], pair[0]),
        )
    ]
    return TagListResponse(tags=items, total=len(items))


@router.get("", response_model=TagListResponse)
async def list_tags() -> TagListResponse:
    """List every tag currently in use, sorted by usage count (descending)."""
    driver = get_neo4j_driver()
    cypher = """
        MATCH (a:Asset)
        RETURN a.metadata AS metadata
    """
    metadatas: list[Any] = []
    async with driver.session() as session:
        result = await session.run(cypher)
        async for record in result:
            metadatas.append(record["metadata"])
    return aggregate_tags(metadatas)
