"""Custom exceptions."""


class HolocronError(Exception):
    """Base exception for Holocron."""

    pass


class NotFoundError(HolocronError):
    """Entity not found."""

    pass


class DuplicateError(HolocronError):
    """Entity already exists."""

    pass


class ValidationError(HolocronError):
    """Validation failed."""

    pass


class DatabaseError(HolocronError):
    """Database operation failed."""

    pass
