"""Shared API dependencies for dependency injection."""

from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import Depends
from neo4j import AsyncSession

from holocron.api.schemas.events import EventResponse
from holocron.core.services import (
    ActorService,
    AssetService,
    GraphService,
    RelationService,
    RuleService,
    SearchService,
)
from holocron.core.services.event_service import EventService
from holocron.core.services.webhook_dispatcher import WebhookDispatcher
from holocron.db.connection import Neo4jDriver, neo4j_driver
from holocron.db.repositories.actor_repo import ActorRepository
from holocron.db.repositories.asset_repo import AssetRepository
from holocron.db.repositories.event_repo import EventRepository
from holocron.db.repositories.relation_repo import RelationRepository
from holocron.db.repositories.rule_repo import RuleRepository
from holocron.db.repositories.webhook_repo import WebhookRepository


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Yield a Neo4j session for request handling."""
    async with neo4j_driver.session() as session:
        yield session


def get_asset_repository() -> AssetRepository:
    """Get the asset repository instance."""
    return AssetRepository()


def get_actor_repository() -> ActorRepository:
    """Get the actor repository instance."""
    return ActorRepository()


def get_relation_repository() -> RelationRepository:
    """Get the relation repository instance."""
    return RelationRepository()


def get_rule_repository() -> RuleRepository:
    """Get the rule repository instance."""
    return RuleRepository()


def get_webhook_repository() -> WebhookRepository:
    """Get the webhook repository instance."""
    return WebhookRepository()


# The dispatcher's bounded ``asyncio.Semaphore`` is per-instance, so the
# ``EventService`` (which holds the dispatcher) must be a process-wide
# singleton — otherwise a new semaphore per request defeats the cap.
_event_service_singleton: EventService | None = None


def _build_event_service() -> EventService:
    return EventService(dispatcher=WebhookDispatcher(repo=WebhookRepository()))


def get_event_repository() -> EventRepository:
    """Return the dispatching event repository (an :class:`EventService`).

    Typed as ``EventRepository`` so existing entity-service constructors —
    which take ``event_repo: EventRepository`` — pick up webhook dispatch
    transparently. ``EventService`` is a subclass.
    """
    global _event_service_singleton
    if _event_service_singleton is None:
        _event_service_singleton = _build_event_service()
    return _event_service_singleton


def get_event_service() -> EventService:
    """Same singleton, exposed under its concrete type for plugin context."""
    global _event_service_singleton
    if _event_service_singleton is None:
        _event_service_singleton = _build_event_service()
    return _event_service_singleton


def get_neo4j_driver() -> Neo4jDriver:
    """Get the Neo4j driver instance."""
    return neo4j_driver


def get_asset_service(
    asset_repo: Annotated[AssetRepository, Depends(get_asset_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
    driver: Annotated[Neo4jDriver, Depends(get_neo4j_driver)],
    relation_repo: Annotated[RelationRepository, Depends(get_relation_repository)],
) -> AssetService:
    """Get the asset service with injected dependencies."""
    return AssetService(
        asset_repo=asset_repo,
        event_repo=event_repo,
        driver=driver,
        relation_repo=relation_repo,
    )


def get_actor_service(
    actor_repo: Annotated[ActorRepository, Depends(get_actor_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
    driver: Annotated[Neo4jDriver, Depends(get_neo4j_driver)],
) -> ActorService:
    """Get the actor service with injected dependencies."""
    return ActorService(actor_repo=actor_repo, event_repo=event_repo, driver=driver)


def get_relation_service(
    relation_repo: Annotated[RelationRepository, Depends(get_relation_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
    driver: Annotated[Neo4jDriver, Depends(get_neo4j_driver)],
) -> RelationService:
    """Get the relation service with injected dependencies."""
    return RelationService(relation_repo=relation_repo, event_repo=event_repo, driver=driver)


def get_rule_service(
    rule_repo: Annotated[RuleRepository, Depends(get_rule_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
    driver: Annotated[Neo4jDriver, Depends(get_neo4j_driver)],
) -> RuleService:
    """Get the rule service with injected dependencies."""
    return RuleService(rule_repo=rule_repo, event_repo=event_repo, driver=driver)


# The GraphService caches a computed layout between requests, so it must
# be a process-wide singleton — re-creating it per request would throw the
# cache away and re-run networkx every time.
_graph_service_singleton: GraphService | None = None


def get_graph_service(
    driver: Annotated[Neo4jDriver, Depends(get_neo4j_driver)],
) -> GraphService:
    """Get (or lazily create) the shared graph service.

    On first construction we subscribe its cache invalidator to the shared
    EventService so any write that changes the topology (asset/actor/rule/
    relation create/update/delete) drops the cached layout. Without this
    hook the map only refreshed on process restart.
    """
    global _graph_service_singleton
    if _graph_service_singleton is None:
        _graph_service_singleton = GraphService(driver=driver)
        get_event_service().add_listener(
            _make_graph_invalidator(_graph_service_singleton)
        )
    return _graph_service_singleton


# Entity types whose mutations affect the data-landscape map.
_TOPOLOGY_ENTITIES = frozenset(
    {
        "asset",
        "actor",
        "rule",
        "relation",
    }
)


def _make_graph_invalidator(
    graph_service: GraphService,
) -> Callable[[EventResponse], None]:
    """Build a sync EventListener that drops the graph cache for any topology
    change. Returned as a closure so the dependency for the singleton stays
    one-way (event -> graph) — the EventService doesn't need to know about
    the GraphService type."""

    def _invalidate(event: EventResponse) -> None:
        if event.entity_type.value in _TOPOLOGY_ENTITIES:
            graph_service.invalidate()

    return _invalidate


def get_search_service(
    asset_service: Annotated[AssetService, Depends(get_asset_service)],
    actor_service: Annotated[ActorService, Depends(get_actor_service)],
    rule_service: Annotated[RuleService, Depends(get_rule_service)],
) -> SearchService:
    """Get the search service — delegates to the three entity services."""
    return SearchService(
        asset_service=asset_service,
        actor_service=actor_service,
        rule_service=rule_service,
    )


# Type aliases for cleaner route signatures
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
EventRepositoryDep = Annotated[EventRepository, Depends(get_event_repository)]
EventServiceDep = Annotated[EventService, Depends(get_event_service)]
WebhookRepositoryDep = Annotated[WebhookRepository, Depends(get_webhook_repository)]
AssetServiceDep = Annotated[AssetService, Depends(get_asset_service)]
ActorServiceDep = Annotated[ActorService, Depends(get_actor_service)]
RelationServiceDep = Annotated[RelationService, Depends(get_relation_service)]
RuleServiceDep = Annotated[RuleService, Depends(get_rule_service)]
SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]
GraphServiceDep = Annotated[GraphService, Depends(get_graph_service)]
