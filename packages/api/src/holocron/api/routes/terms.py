"""Term (Business Glossary) API endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel

from holocron.api.dependencies import TermServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.terms import (
    TermCreate,
    TermListResponse,
    TermResponse,
    TermStatus,
    TermUpdate,
)

router = APIRouter(prefix="/terms", tags=["terms"])


class TermDefinedAsset(BaseModel):
    """An asset that a term `DEFINES`."""

    uid: str
    name: str
    type: str


class TermDefinedAssetsResponse(BaseModel):
    """List of assets a term defines, with the parent term's UID."""

    term_uid: str
    items: list[TermDefinedAsset]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TermResponse)
@limiter.limit("30/minute")
async def create_term(
    request: Request,
    term: TermCreate,
    service: TermServiceDep,
) -> TermResponse:
    """Create a new glossary term."""
    return await service.create(term)


@router.get("", response_model=TermListResponse)
async def list_terms(
    service: TermServiceDep,
    domain: str | None = Query(None, description="Filter by exact domain match"),
    status: TermStatus | None = Query(None, description="Filter by lifecycle status"),
    pii: bool | None = Query(None, description="Filter by PII flag"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> TermListResponse:
    """List terms with optional filtering."""
    return await service.list(
        domain=domain,
        status=status,
        pii=pii,
        limit=limit,
        offset=offset,
    )


@router.get("/{uid}", response_model=TermResponse)
async def get_term(uid: str, service: TermServiceDep) -> TermResponse:
    """Get a single term by UID."""
    return await service.get(uid)


@router.put("/{uid}", response_model=TermResponse)
@limiter.limit("30/minute")
async def update_term(
    request: Request,
    uid: str,
    term: TermUpdate,
    service: TermServiceDep,
) -> TermResponse:
    """Update an existing term."""
    return await service.update(uid, term)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_term(
    request: Request,
    uid: str,
    service: TermServiceDep,
) -> None:
    """Delete a term and every relation incident to it."""
    await service.delete(uid)


@router.post(
    "/{uid}/defines/{asset_uid}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("60/minute")
async def define_asset(
    request: Request,
    uid: str,
    asset_uid: str,
    service: TermServiceDep,
) -> None:
    """Link this term to an asset via a `DEFINES` relation."""
    await service.define(uid, asset_uid)


@router.delete(
    "/{uid}/defines/{asset_uid}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("60/minute")
async def undefine_asset(
    request: Request,
    uid: str,
    asset_uid: str,
    service: TermServiceDep,
) -> None:
    """Remove the `DEFINES` relation(s) from this term to an asset.

    Returns 404 if no edge existed — protects callers against silent
    no-ops when they pass a stale asset_uid.
    """
    removed = await service.undefine(uid, asset_uid)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Term {uid} does not define asset {asset_uid}",
        )


@router.get(
    "/{uid}/defines",
    response_model=TermDefinedAssetsResponse,
)
async def list_defined_assets(
    uid: str,
    service: TermServiceDep,
) -> TermDefinedAssetsResponse:
    """List the assets this term defines."""
    rows: list[dict[str, Any]] = list(await service.list_defined_assets(uid))
    return TermDefinedAssetsResponse(
        term_uid=uid,
        items=[
            TermDefinedAsset(uid=r["uid"], name=r["name"], type=r["type"]) for r in rows
        ],
    )
