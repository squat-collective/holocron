"""Reader endpoints."""

from fastapi import APIRouter

router = APIRouter(prefix="/readers")

# TODO: Implement reader endpoints
# GET    /readers              - List available readers
# GET    /readers/{name}       - Get reader info
# POST   /readers/{name}/scan  - Trigger scan, returns suggestions
