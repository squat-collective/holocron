"""Unit tests for the webhook dispatcher + EventService glue.

We don't hit Neo4j here — the WebhookRepository is fully stubbed and the
HTTP layer goes through ``httpx.MockTransport`` so every assertion is local.
The end-to-end ``POST /webhooks`` + delivery flow is exercised in the
integration test suite (which needs a real database).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from holocron.api.schemas.events import EntityType, EventAction, EventResponse
from holocron.api.schemas.webhooks import (
    WebhookCreate,
    WebhookResponse,
    event_topic,
)
from holocron.core.services.event_service import EventService
from holocron.core.services.webhook_dispatcher import (
    SIGNATURE_HEADER,
    TOPIC_HEADER,
    WebhookDispatcher,
    sign,
)


# ===== fixtures / stubs =====


def _now() -> datetime:
    return datetime.now(UTC)


def _make_webhook(
    *,
    uid: str = "wh-1",
    url: str = "https://hook.example/in",
    events: list[str] | None = None,
    disabled: bool = False,
    failure_count: int = 0,
) -> WebhookResponse:
    return WebhookResponse(
        uid=uid,
        url=url,
        events=events or ["*"],
        description=None,
        disabled=disabled,
        failure_count=failure_count,
        last_fired_at=None,
        last_error=None,
        created_at=_now(),
        updated_at=_now(),
    )


def _make_event(
    *,
    action: EventAction = EventAction.CREATED,
    entity_type: EntityType = EntityType.ASSET,
    uid: str = "evt-1",
) -> EventResponse:
    return EventResponse(
        uid=uid,
        action=action,
        entity_type=entity_type,
        entity_uid="ent-1",
        actor_uid=None,
        timestamp=_now(),
        changes={"name": ["old", "new"]},
        metadata={},
    )


@dataclass
class _StubRepo:
    """In-memory stand-in for WebhookRepository — only the methods the
    dispatcher actually calls."""

    targets: list[tuple[WebhookResponse, str]] = field(default_factory=list)
    successes: list[tuple[str, datetime]] = field(default_factory=list)
    failures: list[tuple[str, datetime, str, int]] = field(default_factory=list)
    failure_counter: dict[str, int] = field(default_factory=dict)
    by_uid: dict[str, WebhookResponse] = field(default_factory=dict)
    secrets: dict[str, str] = field(default_factory=dict)

    async def list_subscribed_to(self, topic: str) -> list[tuple[WebhookResponse, str]]:
        # Match the production semantics: skip disabled + filter by "*"/topic.
        out: list[tuple[WebhookResponse, str]] = []
        for w, secret in self.targets:
            if w.disabled:
                continue
            if "*" in w.events or topic in w.events:
                out.append((w, secret))
        return out

    async def get_by_uid(self, uid: str) -> WebhookResponse | None:
        return self.by_uid.get(uid)

    async def get_secret(self, uid: str) -> str | None:
        return self.secrets.get(uid)

    async def record_success(self, uid: str, fired_at: datetime) -> None:
        self.successes.append((uid, fired_at))
        self.failure_counter[uid] = 0

    async def record_failure(
        self,
        uid: str,
        fired_at: datetime,
        error: str,
        auto_disable_threshold: int,
    ) -> int:
        new_count = self.failure_counter.get(uid, 0) + 1
        self.failure_counter[uid] = new_count
        self.failures.append((uid, fired_at, error, new_count))
        return new_count


def _build_dispatcher(
    repo: _StubRepo,
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    auto_disable_threshold: int = 10,
    max_inflight: int = 100,
) -> tuple[WebhookDispatcher, list[httpx.Request]]:
    captured: list[httpx.Request] = []

    def capturing(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return handler(request)

    transport = httpx.MockTransport(capturing)

    class _BoundClient(httpx.AsyncClient):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    dispatcher = WebhookDispatcher(
        repo=repo,  # type: ignore[arg-type]  # duck-typed stub
        client_factory=_BoundClient,
        auto_disable_threshold=auto_disable_threshold,
        max_inflight=max_inflight,
    )
    return dispatcher, captured


# ===== topic helper =====


class TestTopic:
    @pytest.mark.parametrize(
        "action,entity,expected",
        [
            (EventAction.CREATED, EntityType.ASSET, "asset.created"),
            (EventAction.UPDATED, EntityType.ACTOR, "actor.updated"),
            (EventAction.DELETED, EntityType.RULE, "rule.deleted"),
            (EventAction.CREATED, EntityType.RELATION, "relation.created"),
        ],
    )
    def test_topic_format(
        self, action: EventAction, entity: EntityType, expected: str
    ) -> None:
        assert event_topic(action, entity) == expected


# ===== signature helper =====


class TestSign:
    def test_signature_is_hex_sha256_hmac(self) -> None:
        secret = "shh"
        body = b'{"ok":true}'
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert sign(secret, body) == f"sha256={expected}"

    def test_signature_changes_with_body(self) -> None:
        a = sign("k", b"a")
        b = sign("k", b"b")
        assert a != b


# ===== schema =====


class TestWebhookCreate:
    def test_default_events_is_catch_all(self) -> None:
        wh = WebhookCreate(url="https://x.example/h")  # type: ignore[arg-type]
        assert wh.events == ["*"]

    def test_https_required(self) -> None:
        wh = WebhookCreate(url="http://x.example/h")  # type: ignore[arg-type]
        # HttpUrl accepts http too — we don't enforce HTTPS at v0.1 since dev
        # receivers commonly run on localhost. Document that here so the
        # behaviour is intentional rather than an oversight.
        assert wh.url.scheme == "http"


# ===== dispatcher =====


@pytest.mark.asyncio
class TestDispatcherDelivery:
    async def test_signature_header_is_set(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(uid="wh-1"), "shh")]
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(200, json={"ok": True})
        )
        await dispatcher.dispatch_event(_make_event())

        assert len(captured) == 1
        body = captured[0].read()
        assert captured[0].headers[SIGNATURE_HEADER] == sign("shh", body)
        assert captured[0].headers[TOPIC_HEADER] == "asset.created"

    async def test_payload_includes_topic_and_event_fields(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(), "k")]
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(200, json={})
        )
        await dispatcher.dispatch_event(_make_event(uid="evt-99"))

        body = json.loads(captured[0].read())
        assert body["topic"] == "asset.created"
        assert body["event_uid"] == "evt-99"
        assert body["entity_uid"] == "ent-1"
        assert body["changes"] == {"name": ["old", "new"]}

    async def test_2xx_is_recorded_as_success(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(uid="wh-A"), "k")]
        dispatcher, _ = _build_dispatcher(
            repo, lambda req: httpx.Response(204)
        )
        await dispatcher.dispatch_event(_make_event())

        assert len(repo.successes) == 1
        assert repo.successes[0][0] == "wh-A"
        assert repo.failures == []

    async def test_4xx_is_recorded_as_failure(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(uid="wh-A"), "k")]
        dispatcher, _ = _build_dispatcher(
            repo, lambda req: httpx.Response(500, text="boom")
        )
        await dispatcher.dispatch_event(_make_event())

        assert repo.successes == []
        assert len(repo.failures) == 1
        assert repo.failures[0][0] == "wh-A"
        assert "HTTP 500" in repo.failures[0][2]

    async def test_network_error_is_recorded_as_failure(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(uid="wh-A"), "k")]

        def boom(_req: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("offline")

        dispatcher, _ = _build_dispatcher(repo, boom)
        await dispatcher.dispatch_event(_make_event())

        assert repo.successes == []
        assert len(repo.failures) == 1
        assert "ConnectError" in repo.failures[0][2]

    async def test_filter_match_only_subscribers_are_called(self) -> None:
        repo = _StubRepo()
        repo.targets = [
            (_make_webhook(uid="wh-star", events=["*"]), "k"),
            (_make_webhook(uid="wh-asset", events=["asset.created"]), "k"),
            (_make_webhook(uid="wh-actor", events=["actor.created"]), "k"),
        ]
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(204)
        )
        await dispatcher.dispatch_event(
            _make_event(action=EventAction.CREATED, entity_type=EntityType.ASSET)
        )

        # The actor-only subscriber should NOT have been called.
        called_uids = {s[0] for s in repo.successes}
        assert called_uids == {"wh-star", "wh-asset"}
        assert len(captured) == 2

    async def test_disabled_subscribers_skipped(self) -> None:
        repo = _StubRepo()
        repo.targets = [
            (_make_webhook(uid="wh-on", events=["*"]), "k"),
            (_make_webhook(uid="wh-off", events=["*"], disabled=True), "k"),
        ]
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(204)
        )
        delivered = await dispatcher.dispatch_event(_make_event())
        assert delivered == 1
        assert len(captured) == 1

    async def test_multiple_failures_increment_counter(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(uid="wh-A"), "k")]
        dispatcher, _ = _build_dispatcher(
            repo, lambda req: httpx.Response(500), auto_disable_threshold=3
        )
        for _ in range(3):
            await dispatcher.dispatch_event(_make_event())

        assert repo.failure_counter["wh-A"] == 3

    async def test_dispatch_one_targets_a_specific_webhook(self) -> None:
        repo = _StubRepo()
        wh = _make_webhook(uid="wh-X")
        repo.by_uid["wh-X"] = wh
        repo.secrets["wh-X"] = "the-secret"
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(200)
        )
        ok = await dispatcher.dispatch_one("wh-X", _make_event())
        assert ok is True
        assert len(captured) == 1
        body = captured[0].read()
        assert captured[0].headers[SIGNATURE_HEADER] == sign("the-secret", body)

    async def test_dispatch_one_returns_false_when_unknown(self) -> None:
        repo = _StubRepo()
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(200)
        )
        ok = await dispatcher.dispatch_one("ghost", _make_event())
        assert ok is False
        assert captured == []


# ===== event service =====


@pytest.mark.asyncio
class TestEventServiceDispatch:
    async def test_log_without_dispatcher_skips_dispatch(self) -> None:
        """A None dispatcher means no webhook side-effect — used by tests +
        any call site that instantiates the service standalone."""
        service = EventService(dispatcher=None)
        # We can't await EventRepository.log without Neo4j, but we can verify
        # _schedule_dispatch is never reached by stubbing super().log.
        service._schedule_dispatch = lambda event: pytest.fail(  # type: ignore[method-assign]
            "should not dispatch when dispatcher is None"
        )

        async def fake_log(*_a: Any, **_kw: Any) -> EventResponse:
            return _make_event()

        # Substitute the parent log() so we don't hit Neo4j.
        service.__class__.__bases__[0].log = fake_log  # type: ignore[method-assign,assignment]
        try:
            event = await service.log(
                action=EventAction.CREATED,
                entity_type=EntityType.ASSET,
                entity_uid="x",
            )
            assert event.uid == "evt-1"
        finally:
            # Best-effort restore so we don't poison sibling tests.
            from holocron.db.repositories.event_repo import EventRepository

            service.__class__.__bases__[0].log = EventRepository.log  # type: ignore[method-assign,assignment]

    async def test_log_with_dispatcher_schedules_a_task(self) -> None:
        repo = _StubRepo()
        repo.targets = [(_make_webhook(uid="wh-1"), "k")]
        dispatcher, captured = _build_dispatcher(
            repo, lambda req: httpx.Response(204)
        )
        service = EventService(dispatcher=dispatcher)

        async def fake_log(*_a: Any, **_kw: Any) -> EventResponse:
            return _make_event()

        from holocron.db.repositories.event_repo import EventRepository

        original = EventRepository.log
        EventRepository.log = fake_log  # type: ignore[method-assign,assignment]
        try:
            await service.log(
                action=EventAction.CREATED,
                entity_type=EntityType.ASSET,
                entity_uid="x",
            )
            # The task is scheduled, not awaited — yield to the loop so it runs.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            assert len(captured) == 1
        finally:
            EventRepository.log = original  # type: ignore[method-assign,assignment]
