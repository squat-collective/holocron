"""Relation API endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from holocron.api.schemas.relations import (
    RelationCreate,
    RelationListResponse,
    RelationResponse,
    RelationType,
)
from holocron.db.repositories.relation_repo import relation_repository

router = APIRouter(prefix="/relations", tags=["relations"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=RelationResponse)
async def create_relation(relation: RelationCreate) -> RelationResponse:
    """Create a new relation between two nodes."""
    result = await relation_repository.create(relation)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source or target node not found",
        )
    return result


@router.get("", response_model=RelationListResponse)
async def list_relations(
    type: RelationType | None = Query(None, description="Filter by relation type"),
    from_uid: str | None = Query(None, description="Filter by source node UID"),
    to_uid: str | None = Query(None, description="Filter by target node UID"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> RelationListResponse:
    """List relations with optional filtering."""
    items, total = await relation_repository.list(
        relation_type=type,
        from_uid=from_uid,
        to_uid=to_uid,
        limit=limit,
        offset=offset,
    )
    return RelationListResponse(items=items, total=total)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relation(uid: str) -> None:
    """Delete a relation."""
    deleted = await relation_repository.delete(uid)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Relation not found"
        )
