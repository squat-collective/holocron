"""Tag schemas — surfaced from the `metadata.tags` array on assets."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TagUsage(BaseModel):
    """A tag that's currently in use on at least one asset, with its
    catalog-wide usage count. Counts let UI consumers prefer the
    dominant spelling when offering suggestions (`pii (12)` vs.
    `PII (1)`).
    """

    name: str = Field(..., description="Lowercase tag name as stored on the asset.")
    count: int = Field(..., ge=1, description="Number of assets carrying this tag.")


class TagListResponse(BaseModel):
    """Distinct tags currently in use across the catalog. Sorted by
    count descending, then name ascending — so a typeahead UI can show
    the most-common tags first while staying deterministic.
    """

    tags: list[TagUsage]
    total: int
