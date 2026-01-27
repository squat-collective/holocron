"""Structured logging configuration."""

import logging
import sys
from typing import Any

from holocron.config import settings


def setup_logging() -> None:
    """Configure structured logging for the application.

    Sets up logging with a consistent format including timestamps,
    log levels, and module information.
    """
    # Determine log level from settings or default to INFO
    log_level = logging.DEBUG if settings.api_debug else logging.INFO

    # Create formatter with structured output
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add stream handler (stdout)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(log_level)
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)

    # Set log levels for third-party libraries (reduce noise)
    logging.getLogger("neo4j").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name.

    Args:
        name: Logger name, typically __name__.

    Returns:
        Configured logger instance.
    """
    return logging.getLogger(name)


def log_operation(
    logger: logging.Logger,
    operation: str,
    entity_type: str,
    entity_uid: str | None = None,
    **extra: Any,
) -> None:
    """Log a business operation with structured context.

    Args:
        logger: Logger instance.
        operation: Operation name (e.g., "create", "update", "delete").
        entity_type: Type of entity (e.g., "asset", "actor", "relation").
        entity_uid: Optional entity UID.
        **extra: Additional context to include.
    """
    msg_parts = [f"operation={operation}", f"entity_type={entity_type}"]
    if entity_uid:
        msg_parts.append(f"entity_uid={entity_uid}")
    for key, value in extra.items():
        msg_parts.append(f"{key}={value}")

    logger.info(" | ".join(msg_parts))
