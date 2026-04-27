"""Actor API endpoints."""

from fastapi import APIRouter, Query, Request, status

from holocron.api.dependencies import ActorServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.actors import (
    ActorCreate,
    ActorListResponse,
    ActorResponse,
    ActorType,
    ActorUpdate,
)

router = APIRouter(prefix="/actors", tags=["actors"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ActorResponse)
@limiter.limit("30/minute")
async def create_actor(
    request: Request,
    actor: ActorCreate,
    service: ActorServiceDep,
) -> ActorResponse:
    """Create a new actor (person or group)."""
    return await service.create(actor)


@router.get("", response_model=ActorListResponse)
async def list_actors(
    service: ActorServiceDep,
    type: ActorType | None = Query(None, description="Filter by actor type"),
    limit: int = Query(50, ge=1, le=500, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> ActorListResponse:
    """List actors with optional filtering."""
    return await service.list(actor_type=type, limit=limit, offset=offset)


@router.get("/{uid}", response_model=ActorResponse)
async def get_actor(uid: str, service: ActorServiceDep) -> ActorResponse:
    """Get a single actor by UID."""
    return await service.get(uid)


@router.put("/{uid}", response_model=ActorResponse)
@limiter.limit("30/minute")
async def update_actor(
    request: Request,
    uid: str,
    actor: ActorUpdate,
    service: ActorServiceDep,
) -> ActorResponse:
    """Update an existing actor."""
    return await service.update(uid, actor)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_actor(
    request: Request,
    uid: str,
    service: ActorServiceDep,
) -> None:
    """Delete an actor."""
    await service.delete(uid)
