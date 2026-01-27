"""Relation business logic."""

from holocron.api.schemas.events import EntityType, EventAction
from holocron.api.schemas.relations import (
    RelationCreate,
    RelationListResponse,
    RelationResponse,
    RelationType,
)
from holocron.core.exceptions import NotFoundError
from holocron.db.connection import Neo4jDriver
from holocron.db.repositories.event_repo import EventRepository
from holocron.db.repositories.relation_repo import RelationRepository


class RelationService:
    """Service layer for relation business logic."""

    def __init__(
        self,
        relation_repo: RelationRepository,
        event_repo: EventRepository,
        driver: Neo4jDriver,
    ) -> None:
        """Initialize service with repositories.

        Args:
            relation_repo: Repository for relation operations.
            event_repo: Repository for event logging.
            driver: Neo4j driver for transaction management.
        """
        self.relation_repo = relation_repo
        self.event_repo = event_repo
        self.driver = driver

    async def create(self, relation: RelationCreate) -> RelationResponse:
        """Create a new relation with audit logging.

        Args:
            relation: The relation data to create.

        Returns:
            The created relation.

        Raises:
            NotFoundError: If source or target node not found.
        """
        async with self.driver.transaction() as tx:
            result = await self.relation_repo.create(relation, tx=tx)
            if result is None:
                raise NotFoundError("Source or target node not found")

            await self.event_repo.log(
                action=EventAction.CREATED,
                entity_type=EntityType.RELATION,
                entity_uid=result.uid,
                changes={"relation": relation.model_dump(mode="json")},
                tx=tx,
            )
            return result

    async def get(self, uid: str) -> RelationResponse:
        """Get a relation by UID.

        Args:
            uid: The relation UID.

        Returns:
            The relation.

        Raises:
            NotFoundError: If relation not found.
        """
        result = await self.relation_repo.get_by_uid(uid)
        if result is None:
            raise NotFoundError(f"Relation {uid} not found")
        return result

    async def list(
        self,
        relation_type: RelationType | None = None,
        from_uid: str | None = None,
        to_uid: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> RelationListResponse:
        """List relations with optional filtering.

        Args:
            relation_type: Optional type filter.
            from_uid: Optional source node filter.
            to_uid: Optional target node filter.
            limit: Maximum items to return.
            offset: Number of items to skip.

        Returns:
            Paginated list of relations.
        """
        async with self.driver.session() as session:
            items, total = await self.relation_repo.list(
                relation_type=relation_type,
                from_uid=from_uid,
                to_uid=to_uid,
                limit=limit,
                offset=offset,
                tx=session,
            )
        return RelationListResponse(items=items, total=total)

    async def delete(self, uid: str) -> None:
        """Delete a relation with audit logging.

        Args:
            uid: The relation UID.

        Raises:
            NotFoundError: If relation not found.
        """
        async with self.driver.transaction() as tx:
            # Get current state before deletion
            current = await self.relation_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Relation {uid} not found")

            deleted = await self.relation_repo.delete(uid, tx=tx)
            if not deleted:
                raise NotFoundError(f"Relation {uid} not found")

            await self.event_repo.log(
                action=EventAction.DELETED,
                entity_type=EntityType.RELATION,
                entity_uid=uid,
                changes={"relation": current.model_dump(mode="json")},
                tx=tx,
            )
