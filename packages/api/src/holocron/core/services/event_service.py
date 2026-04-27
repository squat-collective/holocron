"""Event service — :class:`EventRepository` plus webhook dispatch.

Why this exists: the entity services (asset/actor/relation/rule) all call
``event_repo.log(...)`` from inside their own transactions. Subclassing
``EventRepository`` here means we keep every existing ``event_repo:
EventRepository`` annotation working unchanged while adding a single hook
point for webhook fan-out.

The same instance is exposed to plugins as ``PluginContext.event_service``
so plugin authors can record custom audit events that flow through the same
pipeline as first-party writes.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from holocron.api.schemas.events import EntityType, EventAction, EventResponse
from holocron.core.services.webhook_dispatcher import WebhookDispatcher
from holocron.db.repositories.event_repo import EventRepository
from holocron.db.utils import ExecutionContext

logger = logging.getLogger(__name__)

# In-process listener: receives every successfully-logged event. Sync only —
# the only current consumer is :class:`GraphService.invalidate`, which is a
# trivial attribute write. Async fan-out stays the dispatcher's job.
EventListener = Callable[[EventResponse], None]


class EventService(EventRepository):
    """``EventRepository`` that also fires webhooks after every successful log.

    Inheriting (rather than wrapping) keeps the entity-service constructors —
    typed against ``EventRepository`` — usable without churn. ``EventService``
    is-a ``EventRepository`` that does one extra thing.
    """

    def __init__(self, dispatcher: WebhookDispatcher | None = None) -> None:
        self.dispatcher = dispatcher
        self._listeners: list[EventListener] = []

    def add_listener(self, listener: EventListener) -> None:
        """Register an in-process listener invoked synchronously after every
        successful ``log()``. Used to wire cache invalidation into the same
        write pipeline that already feeds webhooks. A listener that raises
        is logged and skipped — one bad subscriber must not block the rest."""
        self._listeners.append(listener)

    async def log(
        self,
        action: EventAction,
        entity_type: EntityType,
        entity_uid: str,
        actor_uid: str | None = None,
        changes: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        tx: ExecutionContext | None = None,
    ) -> EventResponse:
        """Persist the event then schedule webhook dispatch on the loop.

        Dispatch is fire-and-forget — the surrounding API request must not
        block on slow subscribers. If the surrounding transaction rolls back
        after this call, the dispatch will already have been *scheduled* but
        not awaited; in practice the dispatcher hits Neo4j to read the
        subscriber list, which fails too if the database is unreachable, so
        the rollback case is self-limiting. Acceptable for v0.1.
        """
        event = await super().log(
            action=action,
            entity_type=entity_type,
            entity_uid=entity_uid,
            actor_uid=actor_uid,
            changes=changes,
            metadata=metadata,
            tx=tx,
        )
        for listener in self._listeners:
            try:
                listener(event)
            except Exception:
                logger.exception(
                    "event listener failed (entity=%s action=%s)",
                    event.entity_type,
                    event.action,
                )
        if self.dispatcher is not None:
            self._schedule_dispatch(event)
        return event

    def _schedule_dispatch(self, event: EventResponse) -> None:
        """Schedule ``dispatcher.dispatch_event`` on the running loop.

        Uses a strong reference set to keep the task alive — without it the
        garbage collector can drop the task mid-flight (``asyncio.create_task``
        only holds a weak reference).
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # Outside an event loop — happens in synchronous unit tests that
            # exercise an entity service without an awaited fixture. Drop the
            # dispatch silently; webhooks are an integration-level concern.
            return
        assert self.dispatcher is not None  # for mypy — checked by caller
        task = loop.create_task(self.dispatcher.dispatch_event(event))
        _BACKGROUND_TASKS.add(task)
        task.add_done_callback(_BACKGROUND_TASKS.discard)


# Process-wide strong-reference set — see ``_schedule_dispatch`` for why.
_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()
