"""Relation API endpoints."""

from fastapi import APIRouter, HTTPException, Query, Request, status

from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.events import EntityType, EventAction
from holocron.api.schemas.relations import (
    RelationCreate,
    RelationListResponse,
    RelationResponse,
    RelationType,
)
from holocron.db.connection import neo4j_driver
from holocron.db.repositories.event_repo import event_repository
from holocron.db.repositories.relation_repo import relation_repository

router = APIRouter(prefix="/relations", tags=["relations"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=RelationResponse)
@limiter.limit("30/minute")
async def create_relation(request: Request, relation: RelationCreate) -> RelationResponse:
    """Create a new relation between two nodes."""
    async with neo4j_driver.transaction() as tx:
        result = await relation_repository.create(relation, tx=tx)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source or target node not found",
            )

        await event_repository.log(
            action=EventAction.CREATED,
            entity_type=EntityType.RELATION,
            entity_uid=result.uid,
            changes={"relation": relation.model_dump(mode="json")},
            tx=tx,
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
@limiter.limit("30/minute")
async def delete_relation(request: Request, uid: str) -> None:
    """Delete a relation."""
    async with neo4j_driver.transaction() as tx:
        # Get current state before deletion
        current = await relation_repository.get_by_uid(uid, tx=tx)
        if current is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Relation not found"
            )

        deleted = await relation_repository.delete(uid, tx=tx)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Relation not found"
            )

        await event_repository.log(
            action=EventAction.DELETED,
            entity_type=EntityType.RELATION,
            entity_uid=uid,
            changes={"relation": current.model_dump(mode="json")},
            tx=tx,
        )
