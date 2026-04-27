"""Read-only HTTP client over the Holocron API — paginated catalog fetch."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from excel_exporter.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
)

# Stay well under default API rate limit (100/min for reads) and keep payload small enough.
PAGE_SIZE = 100


class HolocronReadClient:
    """Minimal read-only client. Paginates assets/actors/relations into a snapshot."""

    def __init__(self, api_url: str, token: str | None = None, timeout: float = 30.0) -> None:
        headers = {"Authorization": f"Bearer {token}"} if token else None
        self._api_url = api_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._api_url, timeout=timeout, headers=headers
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HolocronReadClient:
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _list_paginated(self, path: str) -> list[dict[str, Any]]:
        all_items: list[dict[str, Any]] = []
        offset = 0
        while True:
            r = self._client.get(path, params={"limit": PAGE_SIZE, "offset": offset})
            r.raise_for_status()
            body = r.json()
            items = body.get("items", [])
            all_items.extend(items)
            total = body.get("total", len(all_items))
            offset += len(items)
            if not items or offset >= total:
                break
        return all_items

    def fetch_snapshot(self) -> CatalogSnapshot:
        return CatalogSnapshot(
            api_url=self._api_url,
            fetched_at=datetime.now(UTC),
            assets=[AssetRecord.model_validate(x) for x in self._list_paginated("/api/v1/assets")],
            actors=[ActorRecord.model_validate(x) for x in self._list_paginated("/api/v1/actors")],
            relations=[
                RelationRecord.model_validate(x) for x in self._list_paginated("/api/v1/relations")
            ],
        )
