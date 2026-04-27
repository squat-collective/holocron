"""Graph map endpoint — the data-landscape view.

`GET /graph/map?lod=0|1` returns every first-class node (and their
relations) with pre-computed `(x, y)` coordinates so a WebGL renderer
can draw the whole landscape without doing layout work.

The `lod` query param is a *ceiling*, not an exact filter: `lod=0`
returns the top-level "architecture" nodes only (systems + teams),
`lod=1` returns those plus every asset, actor, and rule.
"""

from fastapi import APIRouter, Query

from holocron.api.dependencies import GraphServiceDep
from holocron.api.schemas.graph import GraphMapResponse, LodTier

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/map", response_model=GraphMapResponse)
async def get_graph_map(
    service: GraphServiceDep,
    lod: int = Query(
        1,
        ge=0,
        le=1,
        description=(
            "Level-of-detail ceiling. 0 = overview (systems + teams only); "
            "1 = full entity map (+ datasets, reports, processes, people, rules)."
        ),
    ),
) -> GraphMapResponse:
    """Return the data-landscape map at the requested LOD tier."""
    return await service.get_map(LodTier(lod))
