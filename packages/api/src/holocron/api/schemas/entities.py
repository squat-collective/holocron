"""Polymorphic entity-resolution schemas.

The Holocron graph stores Assets, Actors, and Rules under separate
:Asset / :Actor / :Rule labels with their own typed endpoints. UI
consumers and plugin authors often start with just a uid (e.g. from
a relation, a graph node click, an event payload) and need the
typed payload back without first having to guess the label.

`/api/v1/entities/{uid}` returns a discriminated union: a `kind`
field selects which of `asset` / `actor` / `rule` is populated.
"""

from typing import Literal

from pydantic import BaseModel

from holocron.api.schemas.actors import ActorResponse
from holocron.api.schemas.assets import AssetResponse
from holocron.api.schemas.rules import RuleResponse


class EntityAssetResponse(BaseModel):
    """Polymorphic envelope for an Asset hit."""

    kind: Literal["asset"] = "asset"
    asset: AssetResponse


class EntityActorResponse(BaseModel):
    """Polymorphic envelope for an Actor hit."""

    kind: Literal["actor"] = "actor"
    actor: ActorResponse


class EntityRuleResponse(BaseModel):
    """Polymorphic envelope for a Rule hit."""

    kind: Literal["rule"] = "rule"
    rule: RuleResponse


# Union members are listed in the order the resolver checks them —
# Asset first because it's the most common counterparty in relations.
EntityResponse = EntityAssetResponse | EntityActorResponse | EntityRuleResponse
