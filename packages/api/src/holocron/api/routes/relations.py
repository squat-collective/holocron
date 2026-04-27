"""Relation API endpoints."""

from fastapi import APIRouter, Query, Request, status

from holocron.api.dependencies import RelationServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.relations import (
    RelationCreate,
    RelationListResponse,
    RelationResponse,
    RelationType,
)

router = APIRouter(prefix="/relations", tags=["relations"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=RelationResponse)
@limiter.limit("30/minute")
async def create_relation(
    request: Request,
    relation: RelationCreate,
    service: RelationServiceDep,
) -> RelationResponse:
    """Create a new relation between two nodes."""
    return await service.create(relation)


@router.get("", response_model=RelationListResponse)
async def list_relations(
    service: RelationServiceDep,
    type: RelationType | None = Query(None, description="Filter by relation type"),
    from_uid: str | None = Query(None, description="Filter by source node UID"),
    to_uid: str | None = Query(None, description="Filter by target node UID"),
    limit: int = Query(50, ge=1, le=500, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> RelationListResponse:
    """List relations with optional filtering."""
    return await service.list(
        relation_type=type,
        from_uid=from_uid,
        to_uid=to_uid,
        limit=limit,
        offset=offset,
    )


@router.get("/{uid}", response_model=RelationResponse)
async def get_relation(uid: str, service: RelationServiceDep) -> RelationResponse:
    """Get a single relation by UID."""
    return await service.get(uid)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_relation(
    request: Request,
    uid: str,
    service: RelationServiceDep,
) -> None:
    """Delete a relation."""
    await service.delete(uid)
