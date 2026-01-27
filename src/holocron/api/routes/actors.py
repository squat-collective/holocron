"""Actor API endpoints."""

from fastapi import APIRouter, HTTPException, Query, Request, status

from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.actors import (
    ActorCreate,
    ActorListResponse,
    ActorResponse,
    ActorType,
    ActorUpdate,
)
from holocron.api.schemas.events import EntityType, EventAction
from holocron.db.connection import neo4j_driver
from holocron.db.repositories.actor_repo import actor_repository
from holocron.db.repositories.event_repo import event_repository

router = APIRouter(prefix="/actors", tags=["actors"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ActorResponse)
@limiter.limit("30/minute")
async def create_actor(request: Request, actor: ActorCreate) -> ActorResponse:
    """Create a new actor (person or group)."""
    async with neo4j_driver.transaction() as tx:
        result = await actor_repository.create(actor, tx=tx)
        await event_repository.log(
            action=EventAction.CREATED,
            entity_type=EntityType.ACTOR,
            entity_uid=result.uid,
            changes={"actor": actor.model_dump(mode="json")},
            tx=tx,
        )
        return result


@router.get("", response_model=ActorListResponse)
async def list_actors(
    type: ActorType | None = Query(None, description="Filter by actor type"),
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> ActorListResponse:
    """List actors with optional filtering."""
    items, total = await actor_repository.list(actor_type=type, limit=limit, offset=offset)
    return ActorListResponse(items=items, total=total)


@router.get("/{uid}", response_model=ActorResponse)
async def get_actor(uid: str) -> ActorResponse:
    """Get a single actor by UID."""
    actor = await actor_repository.get_by_uid(uid)
    if actor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")
    return actor


@router.put("/{uid}", response_model=ActorResponse)
@limiter.limit("30/minute")
async def update_actor(request: Request, uid: str, actor: ActorUpdate) -> ActorResponse:
    """Update an existing actor."""
    async with neo4j_driver.transaction() as tx:
        # Get current state for change tracking
        current = await actor_repository.get_by_uid(uid, tx=tx)
        if current is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")

        updated = await actor_repository.update(uid, actor, tx=tx)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")

        # Log changes (only fields that were actually updated)
        changes: dict[str, dict[str, object]] = {}
        update_data = actor.model_dump(exclude_none=True)
        current_data = current.model_dump(mode="json")
        for field, new_value in update_data.items():
            old_value = current_data.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}

        if changes:
            await event_repository.log(
                action=EventAction.UPDATED,
                entity_type=EntityType.ACTOR,
                entity_uid=uid,
                changes=changes,
                tx=tx,
            )

        return updated


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_actor(request: Request, uid: str) -> None:
    """Delete an actor."""
    async with neo4j_driver.transaction() as tx:
        # Get current state before deletion
        current = await actor_repository.get_by_uid(uid, tx=tx)
        if current is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")

        deleted = await actor_repository.delete(uid, tx=tx)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")

        await event_repository.log(
            action=EventAction.DELETED,
            entity_type=EntityType.ACTOR,
            entity_uid=uid,
            changes={"actor": current.model_dump(mode="json")},
            tx=tx,
        )
