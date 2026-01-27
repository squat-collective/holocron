"""FastAPI application entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from holocron.api.routes import actors, assets, health
from holocron.db.connection import neo4j_driver


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler."""
    # Startup
    await neo4j_driver.connect()
    yield
    # Shutdown
    await neo4j_driver.disconnect()


app = FastAPI(
    title="Holocron",
    description="A declarative data governance platform",
    version="0.1.0",
    lifespan=lifespan,
)

# Register routes
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(assets.router, prefix="/api/v1")
app.include_router(actors.router, prefix="/api/v1")

# TODO: Add more routes as we implement them
# app.include_router(relations.router, prefix="/api/v1", tags=["relations"])
# app.include_router(readers.router, prefix="/api/v1", tags=["readers"])
