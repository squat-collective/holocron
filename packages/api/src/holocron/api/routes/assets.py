"""Asset API endpoints."""

from fastapi import APIRouter, Query, Request, status

from holocron.api.dependencies import AssetServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.assets import (
    AssetCreate,
    AssetListResponse,
    AssetResponse,
    AssetSchemaCreate,
    AssetTreeNode,
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
    verified: bool | None = Query(
        None,
        description="Filter by verification state. true → only verified; false → only unverified.",
    ),
    has_owner: bool | None = Query(
        None,
        description="true → assets with at least one incoming `owns` relation; false → orphan assets.",
    ),
    has_description: bool | None = Query(
        None,
        description="true → assets with a non-empty description; false → undocumented assets.",
    ),
    limit: int = Query(50, ge=1, le=500, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> AssetListResponse:
    """List assets with optional filtering.

    The verification / ownership / description filters back the
    "governance saved-searches" surface in the UI command palette. When
    multiple filters are supplied they AND together.
    """
    return await service.list(
        asset_type=type,
        verified=verified,
        has_owner=has_owner,
        has_description=has_description,
        limit=limit,
        offset=offset,
    )


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


@router.get("/{uid}/tree", response_model=AssetTreeNode)
async def get_asset_tree(
    uid: str,
    service: AssetServiceDep,
    depth: int = Query(
        1,
        ge=1,
        le=10,
        description="Number of `contains` levels to walk (1 = direct children).",
    ),
) -> AssetTreeNode:
    """Walk the `contains` tree rooted at this asset.

    Only `:Asset` nodes are returned — the `:Container/:Field`
    projection materialised from `metadata.schema` is filtered out.
    """
    return await service.tree(uid, depth=depth)


@router.post(
    "/{uid}/schema",
    status_code=status.HTTP_201_CREATED,
    response_model=AssetTreeNode,
)
@limiter.limit("10/minute")
async def create_asset_schema(
    request: Request,
    uid: str,
    body: AssetSchemaCreate,
    service: AssetServiceDep,
) -> AssetTreeNode:
    """Bulk-create a nested tree of child assets under this asset.

    Each child is created as a real `:Asset` node and linked to its
    parent via a `contains` relation. Children may declare their own
    `children` for arbitrary nesting in a single call.
    """
    return await service.bulk_create_schema(uid, body.children)
