"""Asset business logic."""

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
from holocron.db.connection import neo4j_driver
from holocron.db.repositories.asset_repo import AssetRepository
from holocron.db.repositories.event_repo import EventRepository


class AssetService:
    """Service layer for asset business logic."""

    def __init__(
        self,
        asset_repo: AssetRepository,
        event_repo: EventRepository,
    ) -> None:
        """Initialize service with repositories.

        Args:
            asset_repo: Repository for asset operations.
            event_repo: Repository for event logging.
        """
        self.asset_repo = asset_repo
        self.event_repo = event_repo

    async def create(self, asset: AssetCreate) -> AssetResponse:
        """Create a new asset with audit logging.

        Args:
            asset: The asset data to create.

        Returns:
            The created asset.
        """
        async with neo4j_driver.transaction() as tx:
            result = await self.asset_repo.create(asset, tx=tx)
            await self.event_repo.log(
                action=EventAction.CREATED,
                entity_type=EntityType.ASSET,
                entity_uid=result.uid,
                changes={"asset": asset.model_dump(mode="json")},
                tx=tx,
            )
            return result

    async def get(self, uid: str) -> AssetResponse:
        """Get an asset by UID.

        Args:
            uid: The asset UID.

        Returns:
            The asset.

        Raises:
            NotFoundError: If asset not found.
        """
        asset = await self.asset_repo.get_by_uid(uid)
        if asset is None:
            raise NotFoundError(f"Asset {uid} not found")
        return asset

    async def list(
        self,
        asset_type: AssetType | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AssetListResponse:
        """List assets with optional filtering.

        Args:
            asset_type: Optional type filter.
            limit: Maximum items to return.
            offset: Number of items to skip.

        Returns:
            Paginated list of assets.
        """
        items, total = await self.asset_repo.list(
            asset_type=asset_type,
            limit=limit,
            offset=offset,
        )
        return AssetListResponse(items=items, total=total)

    async def update(self, uid: str, asset: AssetUpdate) -> AssetResponse:
        """Update an asset with change tracking and audit logging.

        Args:
            uid: The asset UID.
            asset: The update data.

        Returns:
            The updated asset.

        Raises:
            NotFoundError: If asset not found.
        """
        async with neo4j_driver.transaction() as tx:
            # Get current state for change tracking
            current = await self.asset_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Asset {uid} not found")

            updated = await self.asset_repo.update(uid, asset, tx=tx)
            if updated is None:
                raise NotFoundError(f"Asset {uid} not found")

            # Compute changes
            changes = self._compute_changes(current, asset)
            if changes:
                await self.event_repo.log(
                    action=EventAction.UPDATED,
                    entity_type=EntityType.ASSET,
                    entity_uid=uid,
                    changes=changes,
                    tx=tx,
                )

            return updated

    async def delete(self, uid: str) -> None:
        """Delete an asset with audit logging.

        Args:
            uid: The asset UID.

        Raises:
            NotFoundError: If asset not found.
        """
        async with neo4j_driver.transaction() as tx:
            # Get current state before deletion
            current = await self.asset_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Asset {uid} not found")

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
        """Compute field-level changes between current and update.

        Args:
            current: Current asset state.
            update: Update data.

        Returns:
            Dict of field changes with old/new values.
        """
        changes: dict[str, dict[str, Any]] = {}
        update_data = update.model_dump(exclude_none=True)
        current_data = current.model_dump(mode="json")

        for field, new_value in update_data.items():
            old_value = current_data.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}

        return changes
