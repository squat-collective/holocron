"""Webhook subscription endpoints.

CRUD over outbound webhook subscribers + a ``/test`` endpoint that fires a
synthetic event so admins can confirm a receiver is wired up correctly
without having to mutate live data.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, status

from holocron.api.dependencies import EventServiceDep, WebhookRepositoryDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.events import EntityType, EventAction, EventResponse
from holocron.api.schemas.webhooks import (
    WebhookCreate,
    WebhookCreateResponse,
    WebhookListResponse,
    WebhookResponse,
    WebhookUpdate,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=WebhookCreateResponse,
)
@limiter.limit("30/minute")
async def create_webhook(
    request: Request,
    webhook: WebhookCreate,
    repo: WebhookRepositoryDep,
) -> WebhookCreateResponse:
    """Register a new webhook. The HMAC ``secret`` is returned **once** — the
    client must store it now to verify future ``X-Holocron-Signature`` headers."""
    return await repo.create(webhook)


@router.get("", response_model=WebhookListResponse)
async def list_webhooks(
    repo: WebhookRepositoryDep,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> WebhookListResponse:
    """List registered webhook subscribers (newest first)."""
    items, total = await repo.list(limit=limit, offset=offset)
    return WebhookListResponse(items=items, total=total)


@router.get("/{uid}", response_model=WebhookResponse)
async def get_webhook(uid: str, repo: WebhookRepositoryDep) -> WebhookResponse:
    """Get a single webhook by uid."""
    webhook = await repo.get_by_uid(uid)
    if webhook is None:
        raise HTTPException(status_code=404, detail=f"Webhook {uid} not found")
    return webhook


@router.put("/{uid}", response_model=WebhookResponse)
@limiter.limit("30/minute")
async def update_webhook(
    request: Request,
    uid: str,
    update: WebhookUpdate,
    repo: WebhookRepositoryDep,
) -> WebhookResponse:
    """Update a webhook. Setting ``disabled=false`` clears the failure counter."""
    webhook = await repo.update(uid, update)
    if webhook is None:
        raise HTTPException(status_code=404, detail=f"Webhook {uid} not found")
    return webhook


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_webhook(
    request: Request,
    uid: str,
    repo: WebhookRepositoryDep,
) -> None:
    """Remove a webhook subscription."""
    deleted = await repo.delete(uid)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Webhook {uid} not found")


@router.post("/{uid}/test", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def test_webhook(
    request: Request,
    uid: str,
    repo: WebhookRepositoryDep,
    event_service: EventServiceDep,
) -> dict[str, bool]:
    """Fire a synthetic event at the webhook so the receiver can be verified.

    The event has ``entity_uid="webhook-test"`` and ``metadata.test=true`` so
    receivers can filter test traffic out of analytics if they want.
    """
    if event_service.dispatcher is None:
        raise HTTPException(status_code=503, detail="Webhook dispatcher not configured")

    webhook = await repo.get_by_uid(uid)
    if webhook is None:
        raise HTTPException(status_code=404, detail=f"Webhook {uid} not found")

    synthetic = EventResponse(
        uid=f"evt-test-{uuid4()}",
        action=EventAction.CREATED,
        entity_type=EntityType.ASSET,
        entity_uid="webhook-test",
        actor_uid=None,
        timestamp=datetime.now(UTC),
        changes={},
        metadata={"test": True, "webhook_uid": uid},
    )
    delivered = await event_service.dispatcher.dispatch_one(uid, synthetic)
    return {"delivered": delivered}
