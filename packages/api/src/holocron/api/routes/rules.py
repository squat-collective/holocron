"""Rule API endpoints."""

from typing import Any

from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel

from holocron.api.dependencies import RuleServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.rules import (
    RuleCreate,
    RuleListResponse,
    RuleResponse,
    RuleSeverity,
    RuleUpdate,
)

router = APIRouter(prefix="/rules", tags=["rules"])


class AppliedRule(BaseModel):
    """Rule + its per-asset APPLIES_TO context (enforcement, field_path, note)."""

    rule: RuleResponse
    relation_uid: str
    enforcement: str | None = None
    field_path: str | None = None
    note: str | None = None
    properties: dict[str, Any] = {}


class AppliedRulesResponse(BaseModel):
    """List of rules applied to one asset, with enforcement context per rule."""

    items: list[AppliedRule]
    total: int


@router.post("", status_code=status.HTTP_201_CREATED, response_model=RuleResponse)
@limiter.limit("30/minute")
async def create_rule(
    request: Request,
    rule: RuleCreate,
    service: RuleServiceDep,
) -> RuleResponse:
    """Create a new rule."""
    return await service.create(rule)


@router.get("", response_model=RuleListResponse)
async def list_rules(
    service: RuleServiceDep,
    category: str | None = Query(None, description="Filter by category"),
    severity: RuleSeverity | None = Query(None, description="Filter by severity"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> RuleListResponse:
    """List rules with optional filtering."""
    return await service.list(
        category=category, severity=severity, limit=limit, offset=offset
    )


@router.get("/for-asset/{asset_uid}", response_model=AppliedRulesResponse)
async def list_rules_for_asset(
    asset_uid: str,
    service: RuleServiceDep,
) -> AppliedRulesResponse:
    """List all rules applied to an asset, with enforcement context per rule."""
    pairs = await service.list_for_asset(asset_uid)
    items: list[AppliedRule] = []
    for pair in pairs:
        props = pair["applies_to"] or {}
        items.append(
            AppliedRule(
                rule=RuleResponse.model_validate(pair["rule"]),
                relation_uid=pair["relation_uid"],
                enforcement=props.get("enforcement"),
                field_path=props.get("field_path"),
                note=props.get("note"),
                properties=props,
            )
        )
    return AppliedRulesResponse(items=items, total=len(items))


@router.get("/{uid}", response_model=RuleResponse)
async def get_rule(uid: str, service: RuleServiceDep) -> RuleResponse:
    """Get a single rule by UID."""
    return await service.get(uid)


@router.put("/{uid}", response_model=RuleResponse)
@limiter.limit("30/minute")
async def update_rule(
    request: Request,
    uid: str,
    rule: RuleUpdate,
    service: RuleServiceDep,
) -> RuleResponse:
    """Update an existing rule."""
    return await service.update(uid, rule)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_rule(
    request: Request,
    uid: str,
    service: RuleServiceDep,
) -> None:
    """Delete a rule (and all APPLIES_TO relations through DETACH DELETE)."""
    await service.delete(uid)
