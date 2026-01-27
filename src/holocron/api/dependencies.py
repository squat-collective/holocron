"""Shared API dependencies for dependency injection."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from neo4j import AsyncSession

from holocron.core.services import ActorService, AssetService, RelationService
from holocron.db.connection import neo4j_driver
from holocron.db.repositories.actor_repo import ActorRepository
from holocron.db.repositories.asset_repo import AssetRepository
from holocron.db.repositories.event_repo import EventRepository
from holocron.db.repositories.relation_repo import RelationRepository


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


def get_event_repository() -> EventRepository:
    """Get the event repository instance."""
    return EventRepository()


def get_asset_service(
    asset_repo: Annotated[AssetRepository, Depends(get_asset_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
) -> AssetService:
    """Get the asset service with injected dependencies."""
    return AssetService(asset_repo=asset_repo, event_repo=event_repo)


def get_actor_service(
    actor_repo: Annotated[ActorRepository, Depends(get_actor_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
) -> ActorService:
    """Get the actor service with injected dependencies."""
    return ActorService(actor_repo=actor_repo, event_repo=event_repo)


def get_relation_service(
    relation_repo: Annotated[RelationRepository, Depends(get_relation_repository)],
    event_repo: Annotated[EventRepository, Depends(get_event_repository)],
) -> RelationService:
    """Get the relation service with injected dependencies."""
    return RelationService(relation_repo=relation_repo, event_repo=event_repo)


# Type aliases for cleaner route signatures
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
EventRepositoryDep = Annotated[EventRepository, Depends(get_event_repository)]
AssetServiceDep = Annotated[AssetService, Depends(get_asset_service)]
ActorServiceDep = Annotated[ActorService, Depends(get_actor_service)]
RelationServiceDep = Annotated[RelationService, Depends(get_relation_service)]
