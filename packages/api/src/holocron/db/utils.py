"""Database utility functions."""

from datetime import datetime
from typing import Any, cast

from neo4j import AsyncManagedTransaction, AsyncSession, AsyncTransaction

# Type alias for Neo4j execution context (either a session or transaction)
ExecutionContext = AsyncSession | AsyncManagedTransaction | AsyncTransaction

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
        # Glossary
        "Term",
    }
)

# Allowlist of valid Neo4j relationship types
ALLOWED_RELATIONSHIP_TYPES: frozenset[str] = frozenset(
    {
        # Actor -> Asset
        "OWNS",
        "USES",
        # Asset -> Asset (lineage — asset-only; processes appear as asset nodes)
        "FEEDS",
        # Parent -> Child (structural)
        "CONTAINS",
        # Actor -> Actor
        "MEMBER_OF",
        # Rule -> Asset
        "APPLIES_TO",
        # Glossary edges
        "DEFINES",  # Term -> Asset
        "STEWARDS",  # Actor -> Term
        "RELATED_TO",  # Term <-> Term
        "SYNONYM_OF",  # Term <-> Term
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


# Characters Lucene treats as operators — stripping them keeps user input
# from breaking the query parser. We lose advanced syntax (intentional
# OR / AND / wildcards), but the fulltext index is a supporting signal in
# hybrid search, not a power-user surface.
_LUCENE_RESERVED = set(r'+-&|!(){}[]^"~*?:\/')


def lucene_query(raw: str) -> str:
    """Turn a user-entered string into a safe Lucene query.

    Splits on whitespace, strips Lucene operators from each word, and
    wraps bare terms with a trailing `*` so prefix matches fire ("leia"
    matches "leia organa"). Returns an empty string when nothing
    actionable is left — callers should treat that as "skip fulltext".
    """
    cleaned_words: list[str] = []
    for word in raw.split():
        stripped = "".join(c for c in word if c not in _LUCENE_RESERVED)
        stripped = stripped.strip()
        if not stripped:
            continue
        # `word*` → prefix match; bare `word` → exact. Combining with OR
        # ensures both contribute to the score.
        cleaned_words.append(f"{stripped} OR {stripped}*")
    if not cleaned_words:
        return ""
    return " OR ".join(cleaned_words)
