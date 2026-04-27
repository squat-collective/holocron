"""httpx-based Holocron API client with idempotent upsert (check-then-create-or-update)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from csv_connector import DISCOVERED_BY
from csv_connector.mapping import (
    ActorPayload,
    AssetPayload,
    MappedScan,
    RelationPayload,
)


@dataclass
class PushSummary:
    """Counts of what happened during push_scan."""

    assets_created: int = 0
    assets_updated: int = 0
    actors_created: int = 0
    actors_updated: int = 0
    relations_created: int = 0
    relations_skipped_existing: int = 0


class HolocronClient:
    """Thin client over the Holocron REST API. Idempotent by deterministic UID."""

    def __init__(self, api_url: str, token: str | None = None, timeout: float = 30.0) -> None:
        headers = {"Authorization": f"Bearer {token}"} if token else None
        self._client = httpx.Client(base_url=api_url.rstrip("/"), timeout=timeout, headers=headers)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HolocronClient:
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    # ----- Assets -----

    def upsert_asset(self, payload: AssetPayload) -> tuple[bool, dict[str, Any]]:
        """POST if missing, PUT if existing. Returns (created, body)."""
        existing = self._client.get(f"/api/v1/assets/{payload.uid}")
        if existing.status_code == 200:
            body = self._client.put(
                f"/api/v1/assets/{payload.uid}",
                json={
                    "name": payload.name,
                    "description": payload.description,
                    "location": payload.location,
                    "metadata": payload.metadata,
                    "discovered_by": DISCOVERED_BY,
                },
            )
            body.raise_for_status()
            return False, body.json()

        body = self._client.post(
            "/api/v1/assets",
            json={
                "uid": payload.uid,
                "type": payload.type,
                "name": payload.name,
                "description": payload.description,
                "location": payload.location,
                "metadata": payload.metadata,
                "verified": False,
                "discovered_by": DISCOVERED_BY,
            },
        )
        body.raise_for_status()
        return True, body.json()

    # ----- Actors -----

    def upsert_actor(self, payload: ActorPayload) -> tuple[bool, dict[str, Any]]:
        existing = self._client.get(f"/api/v1/actors/{payload.uid}")
        if existing.status_code == 200:
            body = self._client.put(
                f"/api/v1/actors/{payload.uid}",
                json={
                    "name": payload.name,
                    "email": payload.email,
                    "metadata": payload.metadata,
                    "discovered_by": DISCOVERED_BY,
                },
            )
            body.raise_for_status()
            return False, body.json()

        body = self._client.post(
            "/api/v1/actors",
            json={
                "uid": payload.uid,
                "type": payload.type,
                "name": payload.name,
                "email": payload.email,
                "metadata": payload.metadata,
                "verified": False,
                "discovered_by": DISCOVERED_BY,
            },
        )
        body.raise_for_status()
        return True, body.json()

    # ----- Relations -----

    def create_relation_if_missing(
        self, payload: RelationPayload
    ) -> tuple[bool, dict[str, Any] | None]:
        """Relations have no PUT — return (created, body or None)."""
        existing = self._client.get(f"/api/v1/relations/{payload.uid}")
        if existing.status_code == 200:
            return False, existing.json()

        body = self._client.post(
            "/api/v1/relations",
            json={
                "uid": payload.uid,
                "from_uid": payload.from_uid,
                "to_uid": payload.to_uid,
                "type": payload.type,
                "properties": payload.properties,
                "verified": False,
                "discovered_by": DISCOVERED_BY,
            },
        )
        if body.status_code == 404:
            return False, None
        body.raise_for_status()
        return True, body.json()

    # ----- Top-level orchestration -----

    def push_scan(self, scan: MappedScan) -> PushSummary:
        summary = PushSummary()

        for asset in scan.assets:
            created, _ = self.upsert_asset(asset)
            if created:
                summary.assets_created += 1
            else:
                summary.assets_updated += 1

        for actor in scan.actors:
            created, _ = self.upsert_actor(actor)
            if created:
                summary.actors_created += 1
            else:
                summary.actors_updated += 1

        for rel in scan.relations:
            created, body = self.create_relation_if_missing(rel)
            if created:
                summary.relations_created += 1
            elif body is not None:
                summary.relations_skipped_existing += 1

        return summary
