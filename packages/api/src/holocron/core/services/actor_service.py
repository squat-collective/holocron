"""Actor business logic."""

import logging
from typing import Any

from holocron.api.schemas.actors import (
    ActorCreate,
    ActorListResponse,
    ActorResponse,
    ActorType,
    ActorUpdate,
)
from holocron.api.schemas.events import EntityType, EventAction
from holocron.core.exceptions import NotFoundError
from holocron.core.services.embedding_service import (
    EmbeddingService,
    actor_embedding_text,
)
from holocron.db.connection import Neo4jDriver
from holocron.db.repositories.actor_repo import ActorRepository
from holocron.db.repositories.event_repo import EventRepository

logger = logging.getLogger(__name__)


class ActorService:
    """Service layer for actor business logic."""

    def __init__(
        self,
        actor_repo: ActorRepository,
        event_repo: EventRepository,
        driver: Neo4jDriver,
    ) -> None:
        """Initialize service with repositories.

        Args:
            actor_repo: Repository for actor operations.
            event_repo: Repository for event logging.
            driver: Neo4j driver for transaction management.
        """
        self.actor_repo = actor_repo
        self.event_repo = event_repo
        self.driver = driver

    async def create(self, actor: ActorCreate) -> ActorResponse:
        """Create a new actor with audit logging.

        Args:
            actor: The actor data to create.

        Returns:
            The created actor.
        """
        async with self.driver.transaction() as tx:
            result = await self.actor_repo.create(actor, tx=tx)
            await self.event_repo.log(
                action=EventAction.CREATED,
                entity_type=EntityType.ACTOR,
                entity_uid=result.uid,
                changes={"actor": actor.model_dump(mode="json")},
                tx=tx,
            )
            await self._embed_actor(result, tx=tx)
            return result

    async def get(self, uid: str) -> ActorResponse:
        """Get an actor by UID.

        Args:
            uid: The actor UID.

        Returns:
            The actor.

        Raises:
            NotFoundError: If actor not found.
        """
        actor = await self.actor_repo.get_by_uid(uid)
        if actor is None:
            raise NotFoundError(f"Actor {uid} not found")
        return actor

    async def list(
        self,
        actor_type: ActorType | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> ActorListResponse:
        """List actors with optional filtering.

        Args:
            actor_type: Optional type filter.
            limit: Maximum items to return.
            offset: Number of items to skip.

        Returns:
            Paginated list of actors.
        """
        async with self.driver.session() as session:
            items, total = await self.actor_repo.list(
                actor_type=actor_type,
                limit=limit,
                offset=offset,
                tx=session,
            )
        return ActorListResponse(items=items, total=total)

    async def update(self, uid: str, actor: ActorUpdate) -> ActorResponse:
        """Update an actor with change tracking and audit logging.

        Args:
            uid: The actor UID.
            actor: The update data.

        Returns:
            The updated actor.

        Raises:
            NotFoundError: If actor not found.
        """
        async with self.driver.transaction() as tx:
            # Get current state for change tracking
            current = await self.actor_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Actor {uid} not found")

            updated = await self.actor_repo.update(uid, actor, tx=tx)
            if updated is None:
                raise NotFoundError(f"Actor {uid} not found")

            # Compute changes
            changes = self._compute_changes(current, actor)
            if changes:
                await self.event_repo.log(
                    action=EventAction.UPDATED,
                    entity_type=EntityType.ACTOR,
                    entity_uid=uid,
                    changes=changes,
                    tx=tx,
                )

            # Re-embed when a field contributing to the embedding text
            # actually changed. Metadata / verified flips aren't part of
            # the text so they don't warrant a rerun.
            if any(
                key in changes for key in ("name", "description", "type", "email")
            ):
                await self._embed_actor(updated, tx=tx)

            return updated

    async def delete(self, uid: str) -> None:
        """Delete an actor with audit logging.

        Args:
            uid: The actor UID.

        Raises:
            NotFoundError: If actor not found.
        """
        async with self.driver.transaction() as tx:
            # Get current state before deletion
            current = await self.actor_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Actor {uid} not found")

            deleted = await self.actor_repo.delete(uid, tx=tx)
            if not deleted:
                raise NotFoundError(f"Actor {uid} not found")

            await self.event_repo.log(
                action=EventAction.DELETED,
                entity_type=EntityType.ACTOR,
                entity_uid=uid,
                changes={"actor": current.model_dump(mode="json")},
                tx=tx,
            )

    def _compute_changes(
        self,
        current: ActorResponse,
        update: ActorUpdate,
    ) -> dict[str, dict[str, Any]]:
        """Compute field-level changes between current and update.

        Args:
            current: Current actor state.
            update: Update data.

        Returns:
            Dict of field changes with old/new values.
        """
        changes: dict[str, dict[str, Any]] = {}
        update_data = update.model_dump(exclude_none=True)
        current_data = current.model_dump(mode="json")

        for field, new_value in update_data.items():
            old_value = current_data.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}

        return changes

    async def _embed_actor(
        self,
        actor: ActorResponse,
        tx: Any = None,
    ) -> None:
        """Compute + store the actor's embedding. Best-effort."""
        try:
            text = actor_embedding_text(
                actor.name,
                actor.description,
                actor.type.value if hasattr(actor.type, "value") else str(actor.type),
                actor.email,
            )
            vector = EmbeddingService.instance().embed_one(text)
            await self.actor_repo.set_embedding(actor.uid, vector, tx=tx)
        except Exception:
            logger.exception("Failed to embed actor %s — skipping", actor.uid)
