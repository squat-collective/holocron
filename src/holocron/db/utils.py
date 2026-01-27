"""Database utility functions."""

from datetime import datetime
from typing import Any, cast

# Allowlist of valid Neo4j labels for nodes
ALLOWED_NODE_LABELS: frozenset[str] = frozenset(
    {
        # Asset types (capitalized from enum values)
        "Dataset",
        "Report",
        "Process",
        "System",
        # Actor types (capitalized from enum values)
        "Person",
        "Group",
    }
)

# Allowlist of valid Neo4j relationship types
ALLOWED_RELATIONSHIP_TYPES: frozenset[str] = frozenset(
    {
        # Actor -> Asset
        "OWNS",
        "USES",
        # Asset -> Asset
        "FEEDS",
        "DERIVED_FROM",
        # System/Process -> Asset
        "CONTAINS",
        "PRODUCES",
        "CONSUMES",
        # Actor -> Actor
        "MEMBER_OF",
    }
)


def validate_node_label(label: str) -> str:
    """Validate that a label is in the allowed set.

    Args:
        label: The label to validate.

    Returns:
        The validated label.

    Raises:
        ValueError: If the label is not in the allowlist.
    """
    if label not in ALLOWED_NODE_LABELS:
        raise ValueError(f"Invalid node label: {label}")
    return label


def validate_relationship_type(rel_type: str) -> str:
    """Validate that a relationship type is in the allowed set.

    Args:
        rel_type: The relationship type to validate.

    Returns:
        The validated relationship type.

    Raises:
        ValueError: If the relationship type is not in the allowlist.
    """
    if rel_type not in ALLOWED_RELATIONSHIP_TYPES:
        raise ValueError(f"Invalid relationship type: {rel_type}")
    return rel_type


def neo4j_datetime_to_python(dt: Any) -> datetime:
    """Convert Neo4j DateTime to Python datetime.

    Args:
        dt: Neo4j DateTime object or Python datetime.

    Returns:
        Python datetime object.
    """
    if hasattr(dt, "to_native"):
        return cast(datetime, dt.to_native())
    return cast(datetime, dt)
