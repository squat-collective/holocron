"""Outbound webhook dispatcher.

Fan-out fire-and-forget delivery for catalog events. Subscribers register a
URL via ``/api/v1/webhooks``; on every event we POST the payload to every
matching URL with an HMAC signature so receivers can verify authenticity.

Design choices:

- **Fire-and-forget.** ``dispatch()`` schedules per-receiver coroutines via
  ``asyncio.create_task`` so writes never block on slow subscribers.
- **Bounded concurrency.** A module-level ``Semaphore`` (cap 100 in-flight)
  protects the API from runaway task creation if a receiver is slow + many
  events arrive at once.
- **No retry queue (v0.1).** Failures bump a counter on the ``:Webhook``
  node; ten consecutive failures auto-disable the subscription. v0.2 will
  add a persistent retry queue.
- **HMAC signature.** ``X-Holocron-Signature: sha256=<hex>`` over the raw
  body bytes. Keeps verification trivial in any language.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
from datetime import UTC, datetime

import httpx

from holocron.api.schemas.events import EventResponse
from holocron.api.schemas.webhooks import WebhookEventPayload, event_topic
from holocron.db.repositories.webhook_repo import WebhookRepository

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 5.0
DEFAULT_AUTO_DISABLE_THRESHOLD = 10
DEFAULT_MAX_INFLIGHT = 100

SIGNATURE_HEADER = "X-Holocron-Signature"
TOPIC_HEADER = "X-Holocron-Topic"
EVENT_UID_HEADER = "X-Holocron-Event-Uid"


def sign(secret: str, body: bytes) -> str:
    """HMAC-SHA256 hex digest, prefixed with ``sha256=`` per webhook conventions."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class WebhookDispatcher:
    """Async dispatcher with bounded concurrency + per-webhook failure tracking.

    ``dispatch_event(event)`` is the public entry point. Callers normally fire
    it via ``asyncio.create_task`` so the API request returns immediately.
    """

    def __init__(
        self,
        repo: WebhookRepository,
        *,
        client_factory: type[httpx.AsyncClient] = httpx.AsyncClient,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        auto_disable_threshold: int = DEFAULT_AUTO_DISABLE_THRESHOLD,
        max_inflight: int = DEFAULT_MAX_INFLIGHT,
    ) -> None:
        self.repo = repo
        # Stash the class so tests can swap it for a MockTransport-backed one.
        self._client_factory = client_factory
        self.timeout_seconds = timeout_seconds
        self.auto_disable_threshold = auto_disable_threshold
        self._semaphore = asyncio.Semaphore(max_inflight)

    async def dispatch_event(self, event: EventResponse) -> int:
        """Fan out an event to every subscribed webhook.

        Returns the number of webhooks the event was delivered to (success or
        failure both count — the return value is "how many tried"). Used by
        the ``/webhooks/{uid}/test`` endpoint to confirm a hit.
        """
        topic = event_topic(event.action, event.entity_type)
        targets = await self.repo.list_subscribed_to(topic)
        if not targets:
            return 0

        body_bytes = self._render_body(topic, event)
        await asyncio.gather(
            *(self._deliver(uid=w.uid, url=w.url, secret=secret, body=body_bytes,
                             topic=topic, event_uid=event.uid)
              for w, secret in targets),
            return_exceptions=True,
        )
        return len(targets)

    async def dispatch_one(
        self,
        webhook_uid: str,
        event: EventResponse,
    ) -> bool:
        """Send a single event to a single webhook regardless of its filter list.

        Used by the ``/webhooks/{uid}/test`` endpoint so admins can verify a
        receiver without having to mutate live data. Returns True on 2xx.
        """
        webhook = await self.repo.get_by_uid(webhook_uid)
        if webhook is None:
            return False
        secret = await self.repo.get_secret(webhook_uid)
        if secret is None:
            return False
        topic = event_topic(event.action, event.entity_type)
        body_bytes = self._render_body(topic, event)
        return await self._deliver(
            uid=webhook.uid,
            url=webhook.url,
            secret=secret,
            body=body_bytes,
            topic=topic,
            event_uid=event.uid,
        )

    # ===== internals =====

    @staticmethod
    def _render_body(topic: str, event: EventResponse) -> bytes:
        payload = WebhookEventPayload(
            topic=topic,
            event_uid=event.uid,
            action=event.action,
            entity_type=event.entity_type,
            entity_uid=event.entity_uid,
            actor_uid=event.actor_uid,
            timestamp=event.timestamp,
            changes=event.changes,
            metadata=event.metadata,
        )
        # ``model_dump_json`` matches the wire format we use everywhere else
        # and produces canonical UTF-8 bytes that the HMAC signs.
        return payload.model_dump_json().encode("utf-8")

    async def _deliver(
        self,
        *,
        uid: str,
        url: str,
        secret: str,
        body: bytes,
        topic: str,
        event_uid: str,
    ) -> bool:
        """POST one webhook delivery. Records success/failure on the node."""
        headers = {
            "Content-Type": "application/json",
            SIGNATURE_HEADER: sign(secret, body),
            TOPIC_HEADER: topic,
            EVENT_UID_HEADER: event_uid,
            "User-Agent": "holocron-webhooks/0.1",
        }
        async with self._semaphore:
            now = datetime.now(UTC)
            try:
                async with self._client_factory(timeout=self.timeout_seconds) as client:
                    response = await client.post(url, content=body, headers=headers)
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                await self._on_failure(uid, now, repr(exc))
                return False

            if response.status_code >= 400:
                await self._on_failure(
                    uid, now, f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False

            await self.repo.record_success(uid, now)
            logger.info(
                "Webhook delivered",
                extra={"webhook_uid": uid, "topic": topic, "status": response.status_code},
            )
            return True

    async def _on_failure(self, uid: str, fired_at: datetime, error: str) -> None:
        count = await self.repo.record_failure(
            uid, fired_at, error, self.auto_disable_threshold
        )
        if count >= self.auto_disable_threshold:
            logger.warning(
                "Webhook auto-disabled after consecutive failures",
                extra={"webhook_uid": uid, "failure_count": count, "last_error": error},
            )
        else:
            logger.warning(
                "Webhook delivery failed",
                extra={"webhook_uid": uid, "failure_count": count, "last_error": error},
            )
