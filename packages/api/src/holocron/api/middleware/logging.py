"""Request/response logging middleware."""

import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from holocron.core.logging import get_logger

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs request and response information."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Log request start and response completion with timing.

        Args:
            request: The incoming request.
            call_next: The next middleware/handler.

        Returns:
            The response.
        """
        # Generate request ID for correlation
        request_id = request.headers.get("X-Request-ID", "-")

        # Log request start
        logger.info(
            f"request_start | method={request.method} | "
            f"path={request.url.path} | request_id={request_id}"
        )

        # Process request and time it
        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Log response
        logger.info(
            f"request_end | method={request.method} | "
            f"path={request.url.path} | status={response.status_code} | "
            f"duration_ms={duration_ms:.2f} | request_id={request_id}"
        )

        return response
