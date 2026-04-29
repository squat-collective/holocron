"""Term (Business Glossary) business logic.

Wraps the term repository with audit-event logging and the term↔asset
linking helpers (`define`/`undefine`) so callers don't have to drop to
the relations API for the most common glossary action.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from holocron.api.schemas.events import EntityType, EventAction
from holocron.api.schemas.relations import RelationCreate, RelationType
from holocron.api.schemas.terms import (
    TermCreate,
    TermListResponse,
    TermResponse,
    TermStatus,
    TermUpdate,
)
from holocron.core.exceptions import NotFoundError
from holocron.db.connection import Neo4jDriver
from holocron.db.repositories.event_repo import EventRepository
from holocron.db.repositories.relation_repo import RelationRepository
from holocron.db.repositories.term_repo import TermRepository

logger = logging.getLogger(__name__)


class TermService:
    """Service layer for glossary terms."""

    def __init__(
        self,
        term_repo: TermRepository,
        event_repo: EventRepository,
        relation_repo: RelationRepository,
        driver: Neo4jDriver,
    ) -> None:
        self.term_repo = term_repo
        self.event_repo = event_repo
        self.relation_repo = relation_repo
        self.driver = driver

    async def create(self, term: TermCreate) -> TermResponse:
        async with self.driver.transaction() as tx:
            result = await self.term_repo.create(term, tx=tx)
            await self.event_repo.log(
                action=EventAction.CREATED,
                entity_type=EntityType.TERM,
                entity_uid=result.uid,
                changes={"term": term.model_dump(mode="json")},
                tx=tx,
            )
            return result

    async def get(self, uid: str) -> TermResponse:
        term = await self.term_repo.get_by_uid(uid)
        if term is None:
            raise NotFoundError(f"Term {uid} not found")
        return term

    async def list(
        self,
        domain: str | None = None,
        status: TermStatus | None = None,
        pii: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> TermListResponse:
        async with self.driver.session() as session:
            items, total = await self.term_repo.list(
                domain=domain,
                status=status,
                pii=pii,
                limit=limit,
                offset=offset,
                tx=session,
            )
        return TermListResponse(items=list(items), total=total)

    async def update(self, uid: str, term: TermUpdate) -> TermResponse:
        async with self.driver.transaction() as tx:
            current = await self.term_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Term {uid} not found")
            updated = await self.term_repo.update(uid, term, tx=tx)
            if updated is None:
                raise NotFoundError(f"Term {uid} not found")
            changes = self._compute_changes(current, term)
            if changes:
                await self.event_repo.log(
                    action=EventAction.UPDATED,
                    entity_type=EntityType.TERM,
                    entity_uid=uid,
                    changes=changes,
                    tx=tx,
                )
            return updated

    async def delete(self, uid: str) -> None:
        async with self.driver.transaction() as tx:
            current = await self.term_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Term {uid} not found")
            deleted = await self.term_repo.delete(uid, tx=tx)
            if not deleted:
                raise NotFoundError(f"Term {uid} not found")
            await self.event_repo.log(
                action=EventAction.DELETED,
                entity_type=EntityType.TERM,
                entity_uid=uid,
                changes={"term": current.model_dump(mode="json")},
                tx=tx,
            )

    async def define(self, term_uid: str, asset_uid: str) -> None:
        """Wire a `Term -[:DEFINES]-> Asset` edge.

        Idempotent — creating the same edge twice succeeds and produces
        a second relation node (matching the rest of the relations API
        which doesn't dedupe on `(from, to, type)`). Callers that want
        single-edge semantics should use `undefine` first.

        Raises NotFoundError if either side is missing — the underlying
        relation create returns None when MATCH fails.
        """
        async with self.driver.transaction() as tx:
            term = await self.term_repo.get_by_uid(term_uid, tx=tx)
            if term is None:
                raise NotFoundError(f"Term {term_uid} not found")
            relation = await self.relation_repo.create(
                RelationCreate(
                    uid=None,
                    from_uid=term_uid,
                    to_uid=asset_uid,
                    type=RelationType.DEFINES,
                ),
                tx=tx,
            )
            if relation is None:
                raise NotFoundError(f"Asset {asset_uid} not found")

    async def undefine(self, term_uid: str, asset_uid: str) -> bool:
        """Remove every `DEFINES` edge between the term and asset.

        Returns True if at least one edge was removed.
        """
        async with self.driver.transaction() as tx:
            result = await tx.run(
                """
                MATCH (:Term {uid: $term_uid})-[r:DEFINES]->(:Asset {uid: $asset_uid})
                WITH r, count(r) AS removed_count
                DELETE r
                RETURN removed_count
                """,
                {"term_uid": term_uid, "asset_uid": asset_uid},
            )
            record = await result.single()
            return record is not None and record["removed_count"] > 0

    async def list_defined_assets(self, uid: str) -> Sequence[dict[str, Any]]:
        """Return the assets this term defines (uid + name + type)."""
        # Existence check first so consumers get a 404 rather than an
        # empty list when they typo'd a UID.
        await self.get(uid)
        async with self.driver.session() as session:
            return await self.term_repo.list_defined_assets(uid, tx=session)

    def _compute_changes(
        self,
        current: TermResponse,
        update: TermUpdate,
    ) -> dict[str, dict[str, Any]]:
        changes: dict[str, dict[str, Any]] = {}
        update_data = update.model_dump(exclude_none=True)
        current_data = current.model_dump(mode="json")
        for field, new_value in update_data.items():
            old_value = current_data.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}
        return changes
