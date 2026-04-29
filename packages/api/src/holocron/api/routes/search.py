"""Cross-entity search endpoint."""

from fastapi import APIRouter, Query, Request

from holocron.api.dependencies import SearchServiceDep
from holocron.api.middleware.rate_limit import limiter
from holocron.api.schemas.search import SearchResponse

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
@limiter.limit("120/minute")
async def search(
    request: Request,
    service: SearchServiceDep,
    q: str = Query("", description="Free-text query"),
    limit: int = Query(50, ge=1, le=500, description="Max items to return"),
    kind: list[str] | None = Query(
        None,
        description=(
            "Restrict results to one or more kinds "
            "(asset / actor / container / field / rule). Repeat the "
            "param for multiple values. Intersects with any `kind:` "
            "prefix typed in the query — wizards that already know "
            "what's valid for a step pass this so a globally-ranked "
            "top-N can't squeeze the relevant kind out."
        ),
    ),
    type: list[str] | None = Query(
        None,
        description=(
            "Type filter, applied per-kind: asset.type for `kind=asset` "
            "(dataset / report / process / system / hierarchical "
            "members), actor.type for `kind=actor` (person / group), "
            "and severity for `kind=rule` (info / warning / critical). "
            "Mixed-kind type lists are routed to the right bucket "
            "automatically."
        ),
    ),
) -> SearchResponse:
    """Search across assets, actors, rules and schema nodes.

    Returns a flat `items` list where each entry is tagged with `kind`
    (asset / container / field / actor / rule). Empty queries return
    an empty list — the UI treats empty search as "show nothing yet".
    """
    return await service.search(q, limit=limit, kinds=kind, types=type)
