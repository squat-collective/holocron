"""Asset API endpoints."""

from fastapi import APIRouter, Query, Request, status

from holocron.api.dependencies import AssetServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.assets import (
    AssetCreate,
    AssetListResponse,
    AssetResponse,
    AssetType,
    AssetUpdate,
)

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AssetResponse)
@limiter.limit("30/minute")
async def create_asset(
    request: Request,
    asset: AssetCreate,
    service: AssetServiceDep,
) -> AssetResponse:
    """Create a new asset."""
    return await service.create(asset)


@router.get("", response_model=AssetListResponse)
async def list_assets(
    service: AssetServiceDep,
    type: AssetType | None = Query(None, description="Filter by asset type"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> AssetListResponse:
    """List assets with optional filtering."""
    return await service.list(asset_type=type, limit=limit, offset=offset)


@router.get("/{uid}", response_model=AssetResponse)
async def get_asset(uid: str, service: AssetServiceDep) -> AssetResponse:
    """Get a single asset by UID."""
    return await service.get(uid)


@router.put("/{uid}", response_model=AssetResponse)
@limiter.limit("30/minute")
async def update_asset(
    request: Request,
    uid: str,
    asset: AssetUpdate,
    service: AssetServiceDep,
) -> AssetResponse:
    """Update an existing asset."""
    return await service.update(uid, asset)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_asset(
    request: Request,
    uid: str,
    service: AssetServiceDep,
) -> None:
    """Delete an asset."""
    await service.delete(uid)
