"""Lower-cased searchable text builders + post-filter helpers used by the
cross-entity search ranker. These let us layer exact-phrase + negation
filters on top of vector/FTS results.
"""

from __future__ import annotations

from typing import Any

from holocron.core.services.query_parser import ParsedQuery


def matches(needle: str, *haystacks: str | None) -> bool:
    for h in haystacks:
        if h and needle in h.lower():
            return True
    return False


def asset_haystack(asset: Any) -> str:
    """Lower-case searchable text for an asset — used for exact/negation
    post-filters on top of the vector ranker."""
    parts: list[str] = [asset.name or ""]
    if asset.description:
        parts.append(asset.description)
    atype = asset.type.value if hasattr(asset.type, "value") else str(asset.type)
    parts.append(atype)
    return " ".join(parts).lower()


def actor_haystack(actor: Any) -> str:
    parts: list[str] = [actor.name or ""]
    if actor.description:
        parts.append(actor.description)
    if actor.email:
        parts.append(actor.email)
    atype = actor.type.value if hasattr(actor.type, "value") else str(actor.type)
    parts.append(atype)
    return " ".join(parts).lower()


def rule_haystack(rule: Any) -> str:
    parts: list[str] = [rule.name or ""]
    if rule.description:
        parts.append(rule.description)
    if rule.category:
        parts.append(rule.category)
    sev = (
        rule.severity.value
        if hasattr(rule.severity, "value")
        else str(rule.severity)
    )
    parts.append(sev)
    return " ".join(parts).lower()


def passes_filters(haystack: str, parsed: ParsedQuery) -> bool:
    """True iff the hit survives the exact-phrase + negation filters.

    Exact phrases are AND'd (all must appear). Negations are also AND'd
    (none may appear). The haystack should already be lower-cased.
    """
    for phrase in parsed.exact_phrases:
        if phrase not in haystack:
            return False
    for neg in parsed.negations:
        if neg in haystack:
            return False
    return True
