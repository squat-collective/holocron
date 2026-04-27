"""Webhook schemas for API requests, responses, and dispatched event payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, HttpUrl

from holocron.api.schemas.events import EntityType, EventAction


def event_topic(action: EventAction, entity_type: EntityType) -> str:
    """Canonical ``"<entity>.<action>"`` topic used in the ``events`` filter list.

    Examples: ``"asset.created"``, ``"actor.deleted"``, ``"rule.updated"``.
    """
    return f"{entity_type.value}.{action.value}"


class WebhookCreate(BaseModel):
    """Request body for registering a new webhook subscription."""

    url: HttpUrl = Field(..., description="HTTPS URL the API will POST events to.")
    events: list[str] = Field(
        default_factory=lambda: ["*"],
        description=(
            "Event topics to subscribe to. Use ``['*']`` for every event, "
            "or a list like ``['asset.created', 'actor.updated']``."
        ),
    )
    secret: str | None = Field(
        None,
        min_length=8,
        max_length=256,
        description=(
            "HMAC key used to sign each request (header ``X-Holocron-Signature``). "
            "Auto-generated when omitted; the generated secret is returned once on creation."
        ),
    )
    description: str | None = Field(None, max_length=500)


class WebhookUpdate(BaseModel):
    """Partial update for an existing webhook. All fields optional."""

    url: HttpUrl | None = None
    events: list[str] | None = None
    description: str | None = Field(None, max_length=500)
    disabled: bool | None = None


class WebhookResponse(BaseModel):
    """Webhook returned by the API. ``secret`` is only ever exposed on creation."""

    uid: str
    url: str
    events: list[str]
    description: str | None
    disabled: bool
    failure_count: int
    last_fired_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class WebhookCreateResponse(WebhookResponse):
    """Webhook + plaintext secret. Only returned once, at creation time."""

    secret: str = Field(..., description="HMAC key — store now, the API will not surface it again.")


class WebhookListResponse(BaseModel):
    items: list[WebhookResponse]
    total: int


class WebhookEventPayload(BaseModel):
    """Body POSTed to subscriber URLs.

    Mirrors :class:`EventResponse` but adds the canonical ``topic`` so receivers
    can route by string without having to read both ``action`` and
    ``entity_type``.
    """

    topic: str = Field(..., description='"<entity>.<action>", e.g. "asset.created".')
    event_uid: str
    action: EventAction
    entity_type: EntityType
    entity_uid: str
    actor_uid: str | None = None
    timestamp: datetime
    changes: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
