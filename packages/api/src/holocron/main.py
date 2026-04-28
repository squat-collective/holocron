"""FastAPI application entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from holocron.api.middleware.logging import RequestLoggingMiddleware
from holocron.api.middleware.rate_limit import limiter
from holocron.api.routes import (
    actors,
    assets,
    events,
    graph,
    health,
    relations,
    rules,
    search,
    tags,
    webhooks,
)
from holocron.core.exceptions import (
    DatabaseError,
    DuplicateError,
    HolocronError,
    NotFoundError,
    ValidationError,
)
from holocron.core.logging import get_logger, setup_logging
from holocron.db.connection import neo4j_driver
from holocron.db.init import init_constraints
from holocron.plugins import get_registry as get_plugin_registry
from holocron.plugins.routes import router as plugins_router

# Setup logging early
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Holocron application...")
    await neo4j_driver.connect()
    logger.info("Connected to Neo4j database")
    await init_constraints()
    logger.info("Database constraints initialized")
    get_plugin_registry().discover()
    yield
    # Shutdown
    logger.info("Shutting down Holocron application...")
    await neo4j_driver.disconnect()
    logger.info("Disconnected from Neo4j database")


app = FastAPI(
    title="Holocron",
    description="A declarative data governance platform",
    version="0.1.0",
    lifespan=lifespan,
)

# Add middlewares
app.add_middleware(RequestLoggingMiddleware)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


# Custom exception handlers for consistent error responses
@app.exception_handler(NotFoundError)
async def not_found_handler(_request: Request, exc: NotFoundError) -> JSONResponse:
    """Handle NotFoundError with 404 response."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": str(exc), "error": "not_found"},
    )


@app.exception_handler(DuplicateError)
async def duplicate_handler(_request: Request, exc: DuplicateError) -> JSONResponse:
    """Handle DuplicateError with 409 response."""
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": str(exc), "error": "duplicate"},
    )


@app.exception_handler(ValidationError)
async def validation_handler(_request: Request, exc: ValidationError) -> JSONResponse:
    """Handle ValidationError with 422 response."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc), "error": "validation_error"},
    )


@app.exception_handler(DatabaseError)
async def database_handler(_request: Request, _exc: DatabaseError) -> JSONResponse:
    """Handle DatabaseError with 503 response."""
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Database operation failed", "error": "database_error"},
    )


@app.exception_handler(HolocronError)
async def holocron_handler(_request: Request, exc: HolocronError) -> JSONResponse:
    """Handle generic HolocronError with 500 response."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": str(exc), "error": "internal_error"},
    )


# Register routes
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(assets.router, prefix="/api/v1")
app.include_router(actors.router, prefix="/api/v1")
app.include_router(relations.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(rules.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(plugins_router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")
