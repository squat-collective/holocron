"""Webhook repository for Neo4j operations."""

from __future__ import annotations

import secrets
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from neo4j.exceptions import ConstraintError

from holocron.api.schemas.webhooks import (
    WebhookCreate,
    WebhookCreateResponse,
    WebhookResponse,
    WebhookUpdate,
)
from holocron.core.exceptions import DuplicateError
from holocron.db.connection import neo4j_driver
from holocron.db.utils import ExecutionContext, neo4j_datetime_to_python


def _generate_secret() -> str:
    """32-byte URL-safe HMAC key. ~43 characters of base64."""
    return secrets.token_urlsafe(32)


def _node_to_webhook(node: dict[str, Any]) -> WebhookResponse:
    """Build a public ``WebhookResponse`` from a stored ``:Webhook`` node.

    The HMAC secret is intentionally **not** included — it's returned exactly
    once, at creation, via :class:`WebhookCreateResponse`.
    """
    return WebhookResponse(
        uid=node["uid"],
        url=node["url"],
        events=list(node.get("events", [])),
        description=node.get("description"),
        disabled=bool(node.get("disabled", False)),
        failure_count=int(node.get("failure_count", 0)),
        last_fired_at=neo4j_datetime_to_python(node["last_fired_at"])
        if node.get("last_fired_at") is not None
        else None,
        last_error=node.get("last_error"),
        created_at=neo4j_datetime_to_python(node["created_at"]),
        updated_at=neo4j_datetime_to_python(node["updated_at"]),
    )


class WebhookRepository:
    """CRUD + failure-tracking for webhook subscriptions in Neo4j."""

    async def create(
        self,
        webhook: WebhookCreate,
        tx: ExecutionContext | None = None,
    ) -> WebhookCreateResponse:
        """Persist a new webhook. Auto-generates UID + secret when missing.

        Returns :class:`WebhookCreateResponse` so the plaintext secret is
        surfaced exactly once. After this call the secret can never be read
        back through the API.
        """
        uid = f"wh-{uuid4()}"
        secret = webhook.secret or _generate_secret()
        now = datetime.now(UTC)

        query = """
            CREATE (w:Webhook {
                uid: $uid,
                url: $url,
                events: $events,
                secret: $secret,
                description: $description,
                disabled: false,
                failure_count: 0,
                last_fired_at: null,
                last_error: null,
                created_at: $created_at,
                updated_at: $updated_at
            })
            RETURN w
        """
        params = {
            "uid": uid,
            "url": str(webhook.url),
            "events": webhook.events,
            "secret": secret,
            "description": webhook.description,
            "created_at": now,
            "updated_at": now,
        }
        try:
            node = await self._single(query, params, tx)
        except ConstraintError as exc:
            raise DuplicateError(f"Webhook {uid} already exists") from exc

        if node is None:
            raise RuntimeError("Failed to create webhook")
        public = _node_to_webhook(node)
        return WebhookCreateResponse(secret=secret, **public.model_dump())

    async def get_by_uid(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> WebhookResponse | None:
        node = await self._single(
            "MATCH (w:Webhook {uid: $uid}) RETURN w",
            {"uid": uid},
            tx,
        )
        return _node_to_webhook(node) if node else None

    async def get_secret(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> str | None:
        """Return the HMAC secret for internal signing. Never expose via the API."""
        record = await self._single(
            "MATCH (w:Webhook {uid: $uid}) RETURN w.secret AS secret",
            {"uid": uid},
            tx,
        )
        if record is None:
            return None
        return record.get("secret")

    async def list(
        self,
        limit: int = 50,
        offset: int = 0,
        tx: ExecutionContext | None = None,
    ) -> tuple[list[WebhookResponse], int]:
        list_query = """
            MATCH (w:Webhook)
            RETURN w
            ORDER BY w.created_at DESC
            SKIP $offset LIMIT $limit
        """
        count_query = "MATCH (w:Webhook) RETURN count(w) AS total"
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if tx is not None:
            items = await self._collect_webhooks(tx, list_query, params)
            count_record = await (await tx.run(count_query)).single()
        else:
            async with neo4j_driver.session() as session:
                items = await self._collect_webhooks(session, list_query, params)
                count_record = await (await session.run(count_query)).single()
        total = int(count_record["total"]) if count_record else 0
        return list(items), total

    async def list_subscribed_to(
        self,
        topic: str,
        tx: ExecutionContext | None = None,
    ) -> Sequence[tuple[WebhookResponse, str]]:
        """Return ``(webhook, secret)`` pairs subscribed to ``topic``.

        Filters out disabled webhooks and matches either ``"*"`` (catch-all)
        or the explicit topic. Returning the secret here keeps the dispatcher's
        hot path to a single round-trip.
        """
        query = """
            MATCH (w:Webhook)
            WHERE w.disabled = false
              AND (any(e IN w.events WHERE e = '*') OR $topic IN w.events)
            RETURN w, w.secret AS secret
            ORDER BY w.created_at ASC
        """
        params = {"topic": topic}

        if tx is not None:
            result = await tx.run(query, params)
            records = await result.data()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                records = await result.data()

        out: list[tuple[WebhookResponse, str]] = []
        for rec in records:
            node = rec["w"]
            if node is None:
                continue
            out.append((_node_to_webhook(dict(node)), rec["secret"]))
        return out

    async def update(
        self,
        uid: str,
        update: WebhookUpdate,
        tx: ExecutionContext | None = None,
    ) -> WebhookResponse | None:
        set_parts = ["w.updated_at = $updated_at"]
        params: dict[str, Any] = {
            "uid": uid,
            "updated_at": datetime.now(UTC),
        }
        if update.url is not None:
            set_parts.append("w.url = $url")
            params["url"] = str(update.url)
        if update.events is not None:
            set_parts.append("w.events = $events")
            params["events"] = update.events
        if update.description is not None:
            set_parts.append("w.description = $description")
            params["description"] = update.description
        if update.disabled is not None:
            set_parts.append("w.disabled = $disabled")
            params["disabled"] = update.disabled
            # Re-enabling a webhook clears the failure trail so it gets a
            # fresh window to re-prove itself before being auto-disabled again.
            if update.disabled is False:
                set_parts.append("w.failure_count = 0")
                set_parts.append("w.last_error = null")

        query = f"""
            MATCH (w:Webhook {{uid: $uid}})
            SET {", ".join(set_parts)}
            RETURN w
        """
        node = await self._single(query, params, tx)
        return _node_to_webhook(node) if node else None

    async def delete(
        self,
        uid: str,
        tx: ExecutionContext | None = None,
    ) -> bool:
        query = """
            MATCH (w:Webhook {uid: $uid})
            DETACH DELETE w
            RETURN count(w) AS deleted
        """
        record = await self._single(query, {"uid": uid}, tx, key=None)
        return bool(record and record.get("deleted", 0) > 0)

    async def record_success(
        self,
        uid: str,
        fired_at: datetime,
        tx: ExecutionContext | None = None,
    ) -> None:
        """Mark a successful delivery — clear failure counters and bump timestamp."""
        query = """
            MATCH (w:Webhook {uid: $uid})
            SET w.last_fired_at = $fired_at,
                w.failure_count = 0,
                w.last_error = null,
                w.updated_at = $updated_at
        """
        params = {
            "uid": uid,
            "fired_at": fired_at,
            "updated_at": fired_at,
        }
        await self._run(query, params, tx)

    async def record_failure(
        self,
        uid: str,
        fired_at: datetime,
        error: str,
        auto_disable_threshold: int,
        tx: ExecutionContext | None = None,
    ) -> int:
        """Increment the failure counter; auto-disable at the threshold.

        Returns the new ``failure_count``. The dispatcher uses this to decide
        whether to log a warning vs. an "auto-disabled" line.
        """
        query = """
            MATCH (w:Webhook {uid: $uid})
            SET w.last_fired_at = $fired_at,
                w.last_error = $error,
                w.failure_count = coalesce(w.failure_count, 0) + 1,
                w.disabled = (coalesce(w.failure_count, 0) + 1) >= $threshold,
                w.updated_at = $updated_at
            RETURN w.failure_count AS failure_count
        """
        params = {
            "uid": uid,
            "fired_at": fired_at,
            "error": error[:500],  # truncate so a chatty receiver can't bloat the node
            "threshold": auto_disable_threshold,
            "updated_at": fired_at,
        }
        record = await self._single(query, params, tx, key=None)
        return int(record["failure_count"]) if record else 0

    # ===== private helpers =====

    async def _single(
        self,
        query: str,
        params: dict[str, Any],
        tx: ExecutionContext | None,
        key: str | None = "w",
    ) -> dict[str, Any] | None:
        """Run ``query``, return the first record's ``key`` field as a dict.

        When ``key`` is None, the raw record dict is returned (used by helpers
        that need scalar fields like ``deleted`` or ``failure_count``).
        """
        if tx is not None:
            result = await tx.run(query, params)
            record = await result.single()
        else:
            async with neo4j_driver.session() as session:
                result = await session.run(query, params)
                record = await result.single()
        if record is None:
            return None
        if key is None:
            return dict(record)
        node = record[key]
        return dict(node) if node is not None else None

    async def _run(
        self,
        query: str,
        params: dict[str, Any],
        tx: ExecutionContext | None,
    ) -> None:
        if tx is not None:
            await tx.run(query, params)
            return
        async with neo4j_driver.session() as session:
            await session.run(query, params)

    @staticmethod
    async def _collect_webhooks(
        ctx: ExecutionContext,
        query: str,
        params: dict[str, Any],
    ) -> Sequence[WebhookResponse]:
        result = await ctx.run(query, params)
        records = await result.data()
        return [_node_to_webhook(dict(r["w"])) for r in records]
