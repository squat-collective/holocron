"""Health check endpoint."""

from fastapi import APIRouter

from holocron.db.connection import neo4j_driver

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Check API and database health."""
    db_status = "healthy" if await neo4j_driver.verify_connectivity() else "unhealthy"

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "api": "healthy",
        "database": db_status,
    }
