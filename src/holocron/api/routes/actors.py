"""Actor API endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from holocron.api.schemas.actors import (
    ActorCreate,
    ActorListResponse,
    ActorResponse,
    ActorType,
    ActorUpdate,
)
from holocron.db.repositories.actor_repo import actor_repository

router = APIRouter(prefix="/actors", tags=["actors"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ActorResponse)
async def create_actor(actor: ActorCreate) -> ActorResponse:
    """Create a new actor (person or group)."""
    return await actor_repository.create(actor)


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
async def update_actor(uid: str, actor: ActorUpdate) -> ActorResponse:
    """Update an existing actor."""
    updated = await actor_repository.update(uid, actor)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")
    return updated


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_actor(uid: str) -> None:
    """Delete an actor."""
    deleted = await actor_repository.delete(uid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actor not found")
