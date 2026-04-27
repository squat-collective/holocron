"""Event API endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from holocron.api.dependencies import EventRepositoryDep
from holocron.api.schemas.events import (
    EntityType,
    EventAction,
    EventListResponse,
    EventResponse,
)

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=EventListResponse)
async def list_events(
    repo: EventRepositoryDep,
    entity_type: EntityType | None = Query(None, description="Filter by entity type"),
    entity_uid: str | None = Query(None, description="Filter by entity UID"),
    action: EventAction | None = Query(None, description="Filter by action"),
    limit: int = Query(50, ge=1, le=500, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
) -> EventListResponse:
    """List events with optional filtering."""
    items, total = await repo.list(
        entity_type=entity_type,
        entity_uid=entity_uid,
        action=action,
        limit=limit,
        offset=offset,
    )
    return EventListResponse(items=items, total=total)


@router.get("/{uid}", response_model=EventResponse)
async def get_event(uid: str, repo: EventRepositoryDep) -> EventResponse:
    """Get a single event by UID."""
    event = await repo.get_by_uid(uid)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )
    return event
