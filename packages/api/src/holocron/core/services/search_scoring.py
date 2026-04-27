"""Scoring constants + score-fusion helpers for cross-entity search.

Pure functions — no I/O, no DB access. Lives next to `search_service.py`
because both files participate in one feature.
"""

from __future__ import annotations

from typing import Any

# Cap per-kind so an asset-heavy catalog can't drown out actor/rule hits.
PER_KIND_CAP = 20
# Fetched-upstream ceiling for the legacy substring scan. Matches the
# existing list endpoints' max.
UPSTREAM_FETCH = 100
# How many top-ranked assets to pull from the vector index. We pull extra
# so the schema-walker has a wider net for container/field hits even when
# the asset cap is hit first.
VECTOR_ASSET_FETCH = 60
# Neutral score for substring / empty-query fallbacks so the merged-by-score
# ordering is still deterministic. Sits below typical vector scores so real
# semantic hits always beat a filter-only pass.
NEUTRAL_SCORE = 0.5

# When the fulltext index produced at least one reasonable hit (score
# above this threshold), entities with *no* fulltext match get their
# vector score multiplied by this penalty. Keeps queries like "leia"
# from filling the top with vibe-similar Rebels who happen to have no
# literal match. Set to 1.0 to disable.
FTS_PRIMARY_THRESHOLD = 0.55
VECTOR_ONLY_PENALTY = 0.55


def normalize_fts_score(s: float) -> float:
    """Squash an unbounded Lucene score into ~0..1 with a saturation curve.

    Lucene scores are unbounded (typical range 0..5 for small catalogs).
    The 2.5 coefficient amplifies small Lucene scores so even a modest
    keyword match registers strongly — an exact name match around 1.4
    lands near 0.81.
    """
    return 1.0 - 1.0 / (1.0 + 2.5 * s)


def hybrid(a: float, b: float) -> float:
    """Probabilistic-OR fusion: if either channel says "yes" the combined
    score is high. ``1 - (1-a)*(1-b)``. Used to combine vector + fulltext
    so a literal hit on an entity lifts it above a merely-semantically-
    similar sibling."""
    return 1.0 - (1.0 - a) * (1.0 - b)


def fold_fts(
    merged: dict[str, tuple[Any, float]],
    fts_matches: dict[str, float],
) -> dict[str, tuple[Any, float]]:
    """Combine the vector-scored `merged` dict with fulltext `fts_matches`
    (uid → normalized FTS score). If any FTS hit crosses the "primary"
    threshold we treat keyword as the dominant signal and soften pure
    vector hits."""
    has_strong_fts = any(s >= FTS_PRIMARY_THRESHOLD for s in fts_matches.values())
    out: dict[str, tuple[Any, float]] = {}
    for uid, (entity, v_score) in merged.items():
        fts_score = fts_matches.get(uid, 0.0)
        combined = hybrid(v_score, fts_score)
        if has_strong_fts and fts_score == 0.0:
            combined *= VECTOR_ONLY_PENALTY
        out[uid] = (entity, combined)
    return out


def intersect_filters(*sets: set[str] | None) -> set[str] | None:
    """Intersect any number of optional uid sets. `None` entries mean
    "no filter on this axis" and are skipped. Returns `None` when every
    axis is unfiltered, so callers can tell apart "no graph filter
    active" from "graph filter matched nothing"."""
    active = [s for s in sets if s is not None]
    if not active:
        return None
    result = active[0].copy()
    for s in active[1:]:
        result &= s
    return result
