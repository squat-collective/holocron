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
) -> SearchResponse:
    """Search across assets, actors, rules and schema nodes.

    Returns a flat `items` list where each entry is tagged with `kind`
    (asset / container / field / actor / rule). Empty queries return
    an empty list — the UI treats empty search as "show nothing yet".
    """
    return await service.search(q, limit=limit)
