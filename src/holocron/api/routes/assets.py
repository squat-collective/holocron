"""Asset API endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from holocron.api.schemas.assets import (
    AssetCreate,
    AssetListResponse,
    AssetResponse,
    AssetType,
    AssetUpdate,
)
from holocron.api.schemas.events import EntityType, EventAction
from holocron.db.repositories.asset_repo import asset_repository
from holocron.db.repositories.event_repo import event_repository

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AssetResponse)
async def create_asset(asset: AssetCreate) -> AssetResponse:
    """Create a new asset."""
    result = await asset_repository.create(asset)
    await event_repository.log(
        action=EventAction.CREATED,
        entity_type=EntityType.ASSET,
        entity_uid=result.uid,
        changes={"asset": asset.model_dump(mode="json")},
    )
    return result


@router.get("", response_model=AssetListResponse)
async def list_assets(
    type: AssetType | None = Query(None, description="Filter by asset type"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> AssetListResponse:
    """List assets with optional filtering."""
    items, total = await asset_repository.list(asset_type=type, limit=limit, offset=offset)
    return AssetListResponse(items=items, total=total)


@router.get("/{uid}", response_model=AssetResponse)
async def get_asset(uid: str) -> AssetResponse:
    """Get a single asset by UID."""
    asset = await asset_repository.get_by_uid(uid)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return asset


@router.put("/{uid}", response_model=AssetResponse)
async def update_asset(uid: str, asset: AssetUpdate) -> AssetResponse:
    """Update an existing asset."""
    # Get current state for change tracking
    current = await asset_repository.get_by_uid(uid)
    if current is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    updated = await asset_repository.update(uid, asset)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    # Log changes (only fields that were actually updated)
    changes: dict[str, dict[str, object]] = {}
    update_data = asset.model_dump(exclude_none=True)
    current_data = current.model_dump(mode="json")
    for field, new_value in update_data.items():
        old_value = current_data.get(field)
        if old_value != new_value:
            changes[field] = {"old": old_value, "new": new_value}

    if changes:
        await event_repository.log(
            action=EventAction.UPDATED,
            entity_type=EntityType.ASSET,
            entity_uid=uid,
            changes=changes,
        )

    return updated


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(uid: str) -> None:
    """Delete an asset."""
    # Get current state before deletion
    current = await asset_repository.get_by_uid(uid)
    if current is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    deleted = await asset_repository.delete(uid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    await event_repository.log(
        action=EventAction.DELETED,
        entity_type=EntityType.ASSET,
        entity_uid=uid,
        changes={"asset": current.model_dump(mode="json")},
    )
