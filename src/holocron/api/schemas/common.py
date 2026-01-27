"""Common schemas used across endpoints."""

from pydantic import BaseModel


class PaginationParams(BaseModel):
    """Pagination parameters."""

    skip: int = 0
    limit: int = 100


class PaginatedResponse[T](BaseModel):
    """Generic paginated response."""

    items: list[T]
    total: int
    skip: int
    limit: int
