"""Polymorphic entity resolver.

`GET /api/v1/entities/{uid}` looks up a node by `uid` regardless of
label and returns the typed payload via a discriminated union. This
is the right primitive for any client that has a uid-of-unknown-type
in hand (graph node clicks, relation counterparties, event payloads)
and would otherwise have to fan out across `/assets/`, `/actors/`,
`/rules/` and inspect the 404s.
"""

from fastapi import APIRouter

from holocron.api.dependencies import (
    ActorServiceDep,
    AssetServiceDep,
    RuleServiceDep,
)
from holocron.api.schemas.entities import (
    EntityActorResponse,
    EntityAssetResponse,
    EntityResponse,
    EntityRuleResponse,
)
from holocron.core.exceptions import NotFoundError
from holocron.db.connection import neo4j_driver

router = APIRouter(prefix="/entities", tags=["entities"])


# Order matters: Asset first because it's the dominant counterparty in
# relations (every dataset/report node, every column ancestor). Actor
# next; Rule last (rules are infrequent counterparties).
_RESOLVE_QUERY = """
    MATCH (n {uid: $uid})
    WHERE n:Asset OR n:Actor OR n:Rule
    RETURN
        labels(n) AS labels,
        n.uid AS uid
    LIMIT 1
"""


@router.get("/{uid}", response_model=EntityResponse)
async def get_entity(
    uid: str,
    asset_service: AssetServiceDep,
    actor_service: ActorServiceDep,
    rule_service: RuleServiceDep,
) -> EntityResponse:
    """Resolve `uid` to its typed payload, regardless of node label.

    The lookup is a single Cypher hop to determine the label, followed
    by a typed read through the appropriate service so all the usual
    response shaping (JSON metadata decode, datetime conversion, etc.)
    runs unchanged. 404 if no node has that uid.
    """
    async with neo4j_driver.session() as session:
        result = await session.run(_RESOLVE_QUERY, {"uid": uid})
        record = await result.single()
    if record is None:
        raise NotFoundError(f"Entity {uid} not found")

    labels = set(record["labels"])
    if "Asset" in labels:
        return EntityAssetResponse(asset=await asset_service.get(uid))
    if "Actor" in labels:
        return EntityActorResponse(actor=await actor_service.get(uid))
    if "Rule" in labels:
        return EntityRuleResponse(rule=await rule_service.get(uid))

    # Defensive: the WHERE clause filters the labels we know how to
    # render, so this branch only fires if a future label slips into
    # the WHERE without a matching dispatch arm.
    raise NotFoundError(f"Entity {uid} has unsupported labels {sorted(labels)}")
