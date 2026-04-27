"""Asset business logic."""

from __future__ import annotations

import logging
from typing import Any

from holocron.api.schemas.assets import (
    AssetCreate,
    AssetListResponse,
    AssetResponse,
    AssetType,
    AssetUpdate,
)
from holocron.api.schemas.events import EntityType, EventAction
from holocron.core.exceptions import NotFoundError
from holocron.core.services.asset_schema_projection import (
    materialize_schema,
    tear_down_schema,
)
from holocron.core.services.embedding_service import (
    EmbeddingService,
    asset_embedding_text,
)
from holocron.db.connection import Neo4jDriver
from holocron.db.repositories.asset_repo import AssetRepository
from holocron.db.repositories.event_repo import EventRepository

logger = logging.getLogger(__name__)


class AssetService:
    """Service layer for asset business logic."""

    def __init__(
        self,
        asset_repo: AssetRepository,
        event_repo: EventRepository,
        driver: Neo4jDriver,
    ) -> None:
        """Initialize service with repositories.

        Args:
            asset_repo: Repository for asset operations.
            event_repo: Repository for event logging.
            driver: Neo4j driver for transaction management.
        """
        self.asset_repo = asset_repo
        self.event_repo = event_repo
        self.driver = driver

    async def create(self, asset: AssetCreate) -> AssetResponse:
        """Create a new asset with audit logging."""
        async with self.driver.transaction() as tx:
            result = await self.asset_repo.create(asset, tx=tx)
            await self.event_repo.log(
                action=EventAction.CREATED,
                entity_type=EntityType.ASSET,
                entity_uid=result.uid,
                changes={"asset": asset.model_dump(mode="json")},
                tx=tx,
            )
            await self._embed_asset(result, tx=tx)
            await materialize_schema(result, tx=tx)
            return result

    async def get(self, uid: str) -> AssetResponse:
        """Get an asset by UID. Raises NotFoundError if missing."""
        asset = await self.asset_repo.get_by_uid(uid)
        if asset is None:
            raise NotFoundError(f"Asset {uid} not found")
        return asset

    async def list(
        self,
        asset_type: AssetType | None = None,
        verified: bool | None = None,
        has_owner: bool | None = None,
        has_description: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AssetListResponse:
        """List assets with optional filtering."""
        async with self.driver.session() as session:
            items, total = await self.asset_repo.list(
                asset_type=asset_type,
                verified=verified,
                has_owner=has_owner,
                has_description=has_description,
                limit=limit,
                offset=offset,
                tx=session,
            )
        return AssetListResponse(items=items, total=total)

    async def update(self, uid: str, asset: AssetUpdate) -> AssetResponse:
        """Update an asset with change tracking and audit logging."""
        async with self.driver.transaction() as tx:
            # Get current state for change tracking
            current = await self.asset_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Asset {uid} not found")

            updated = await self.asset_repo.update(uid, asset, tx=tx)
            if updated is None:
                raise NotFoundError(f"Asset {uid} not found")

            changes = self._compute_changes(current, asset)
            if changes:
                await self.event_repo.log(
                    action=EventAction.UPDATED,
                    entity_type=EntityType.ASSET,
                    entity_uid=uid,
                    changes=changes,
                    tx=tx,
                )

            # Re-embed only when a text field that feeds the embedding
            # actually changed. Metadata / status / verified changes don't
            # need a rerun — they're not part of the embedding input.
            if any(
                key in changes for key in ("name", "description", "type", "location")
            ):
                await self._embed_asset(updated, tx=tx)

            # The metadata.schema JSON is authoritative but we keep a real
            # graph projection (:Container / :Field) in sync so vector +
            # fulltext column search can skip the per-asset Python walk.
            # Rebuild the projection whenever metadata or name changes.
            if "metadata" in changes or "name" in changes:
                await materialize_schema(updated, tx=tx)

            return updated

    async def delete(self, uid: str) -> None:
        """Delete an asset with audit logging."""
        async with self.driver.transaction() as tx:
            current = await self.asset_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Asset {uid} not found")

            # Drop every :Container/:Field dangling under this asset before
            # the asset itself — otherwise they'd orphan in the graph.
            await tear_down_schema(uid, tx=tx)

            deleted = await self.asset_repo.delete(uid, tx=tx)
            if not deleted:
                raise NotFoundError(f"Asset {uid} not found")

            await self.event_repo.log(
                action=EventAction.DELETED,
                entity_type=EntityType.ASSET,
                entity_uid=uid,
                changes={"asset": current.model_dump(mode="json")},
                tx=tx,
            )

    def _compute_changes(
        self,
        current: AssetResponse,
        update: AssetUpdate,
    ) -> dict[str, dict[str, Any]]:
        """Compute field-level changes between current and update."""
        changes: dict[str, dict[str, Any]] = {}
        update_data = update.model_dump(exclude_none=True)
        current_data = current.model_dump(mode="json")

        for field, new_value in update_data.items():
            old_value = current_data.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}

        return changes

    async def _embed_asset(
        self,
        asset: AssetResponse,
        tx: Any = None,
    ) -> None:
        """Compute + store the asset's embedding. Best-effort: a failure
        here (model download, ONNX runtime hiccup, Neo4j index unavailable)
        shouldn't poison the write — semantic search degrades gracefully to
        "no hit" for this asset."""
        try:
            text = asset_embedding_text(
                asset.name,
                asset.description,
                asset.type.value if hasattr(asset.type, "value") else str(asset.type),
                asset.location,
            )
            vector = EmbeddingService.instance().embed_one(text)
            await self.asset_repo.set_embedding(asset.uid, vector, tx=tx)
        except Exception:
            logger.exception("Failed to embed asset %s — skipping", asset.uid)
