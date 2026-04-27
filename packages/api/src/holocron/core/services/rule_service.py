"""Rule business logic."""

from __future__ import annotations

import logging
from typing import Any

from holocron.api.schemas.events import EntityType, EventAction
from holocron.api.schemas.rules import (
    RuleCreate,
    RuleListResponse,
    RuleResponse,
    RuleSeverity,
    RuleUpdate,
)
from holocron.core.exceptions import NotFoundError
from holocron.core.services.embedding_service import (
    EmbeddingService,
    rule_embedding_text,
)
from holocron.db.connection import Neo4jDriver
from holocron.db.repositories.event_repo import EventRepository
from holocron.db.repositories.rule_repo import RuleRepository

logger = logging.getLogger(__name__)


class RuleService:
    """Service layer for data-quality rule business logic."""

    def __init__(
        self,
        rule_repo: RuleRepository,
        event_repo: EventRepository,
        driver: Neo4jDriver,
    ) -> None:
        self.rule_repo = rule_repo
        self.event_repo = event_repo
        self.driver = driver

    async def create(self, rule: RuleCreate) -> RuleResponse:
        async with self.driver.transaction() as tx:
            result = await self.rule_repo.create(rule, tx=tx)
            await self.event_repo.log(
                action=EventAction.CREATED,
                entity_type=EntityType.RULE,
                entity_uid=result.uid,
                changes={"rule": rule.model_dump(mode="json")},
                tx=tx,
            )
            await self._embed_rule(result, tx=tx)
            return result

    async def get(self, uid: str) -> RuleResponse:
        rule = await self.rule_repo.get_by_uid(uid)
        if rule is None:
            raise NotFoundError(f"Rule {uid} not found")
        return rule

    async def list(
        self,
        category: str | None = None,
        severity: RuleSeverity | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> RuleListResponse:
        async with self.driver.session() as session:
            items, total = await self.rule_repo.list(
                category=category,
                severity=severity,
                limit=limit,
                offset=offset,
                tx=session,
            )
        return RuleListResponse(items=items, total=total)

    async def list_for_asset(self, asset_uid: str) -> list[dict[str, Any]]:
        """Return rules with their per-asset enforcement context + relation uid (for detach)."""
        async with self.driver.session() as session:
            triples = await self.rule_repo.list_for_asset(asset_uid, tx=session)
        return [
            {
                "rule": rule.model_dump(mode="json"),
                "relation_uid": relation_uid,
                "applies_to": props,
            }
            for rule, relation_uid, props in triples
        ]

    async def update(self, uid: str, rule: RuleUpdate) -> RuleResponse:
        async with self.driver.transaction() as tx:
            current = await self.rule_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Rule {uid} not found")

            updated = await self.rule_repo.update(uid, rule, tx=tx)
            if updated is None:
                raise NotFoundError(f"Rule {uid} not found")

            changes = self._compute_changes(current, rule)
            if changes:
                await self.event_repo.log(
                    action=EventAction.UPDATED,
                    entity_type=EntityType.RULE,
                    entity_uid=uid,
                    changes=changes,
                    tx=tx,
                )
            if any(
                key in changes
                for key in ("name", "description", "severity", "category")
            ):
                await self._embed_rule(updated, tx=tx)
            return updated

    async def delete(self, uid: str) -> None:
        async with self.driver.transaction() as tx:
            current = await self.rule_repo.get_by_uid(uid, tx=tx)
            if current is None:
                raise NotFoundError(f"Rule {uid} not found")

            deleted = await self.rule_repo.delete(uid, tx=tx)
            if not deleted:
                raise NotFoundError(f"Rule {uid} not found")

            await self.event_repo.log(
                action=EventAction.DELETED,
                entity_type=EntityType.RULE,
                entity_uid=uid,
                changes={"rule": current.model_dump(mode="json")},
                tx=tx,
            )

    def _compute_changes(
        self,
        current: RuleResponse,
        update: RuleUpdate,
    ) -> dict[str, dict[str, Any]]:
        changes: dict[str, dict[str, Any]] = {}
        update_data = update.model_dump(exclude_none=True)
        current_data = current.model_dump(mode="json")
        for field, new_value in update_data.items():
            old_value = current_data.get(field)
            if old_value != new_value:
                changes[field] = {"old": old_value, "new": new_value}
        return changes

    async def _embed_rule(
        self,
        rule: RuleResponse,
        tx: Any = None,
    ) -> None:
        """Compute + store the rule's embedding. Best-effort."""
        try:
            text = rule_embedding_text(
                rule.name,
                rule.description,
                rule.severity.value
                if hasattr(rule.severity, "value")
                else str(rule.severity),
                rule.category,
            )
            vector = EmbeddingService.instance().embed_one(text)
            await self.rule_repo.set_embedding(rule.uid, vector, tx=tx)
        except Exception:
            logger.exception("Failed to embed rule %s — skipping", rule.uid)
