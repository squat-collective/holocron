"""Unit tests for the score-fusion helpers.

These four functions tune how vector + fulltext signals combine. Pure
math, but easy to break — we pin the documented invariants so a future
constant tweak makes the regression visible.
"""

import math

import pytest

from holocron.core.services.search_scoring import (
    FTS_PRIMARY_THRESHOLD,
    NEUTRAL_SCORE,
    VECTOR_ONLY_PENALTY,
    fold_fts,
    hybrid,
    intersect_filters,
    normalize_fts_score,
)


class TestNormalizeFtsScore:
    def test_zero_input_is_zero(self) -> None:
        assert normalize_fts_score(0.0) == 0.0

    def test_output_in_unit_range(self) -> None:
        for s in [0.1, 0.5, 1.0, 1.4, 5.0, 50.0]:
            v = normalize_fts_score(s)
            assert 0.0 <= v < 1.0

    def test_monotonic_in_input(self) -> None:
        # Higher Lucene score should never produce a lower normalized one.
        samples = [0.0, 0.25, 0.5, 1.0, 1.4, 2.0, 5.0]
        out = [normalize_fts_score(s) for s in samples]
        assert out == sorted(out)

    def test_modest_match_reaches_doc_string_threshold(self) -> None:
        # The docstring promises "an exact name match around 1.4 lands
        # near 0.81". Pin that anchor — a tweak to the 2.5 coefficient
        # will trip this and force a deliberate review.
        assert math.isclose(normalize_fts_score(1.4), 0.7777, abs_tol=0.05)

    def test_saturates_below_one(self) -> None:
        # The asymptote at 1.0 means even huge Lucene scores never reach
        # the cap. This protects hybrid() from overflow-ish behavior.
        assert normalize_fts_score(1e6) < 1.0


class TestHybrid:
    def test_either_zero_returns_other(self) -> None:
        assert hybrid(0.0, 0.7) == pytest.approx(0.7)
        assert hybrid(0.4, 0.0) == pytest.approx(0.4)

    def test_both_zero(self) -> None:
        assert hybrid(0.0, 0.0) == 0.0

    def test_commutative(self) -> None:
        for a, b in [(0.3, 0.6), (0.1, 0.9), (0.5, 0.5)]:
            assert hybrid(a, b) == pytest.approx(hybrid(b, a))

    def test_combined_score_lifts_above_either_input(self) -> None:
        # The whole point of hybrid: a hit on both channels beats a
        # hit on just one.
        a, b = 0.6, 0.4
        combined = hybrid(a, b)
        assert combined > a
        assert combined > b

    def test_monotonic_in_each_input(self) -> None:
        base = hybrid(0.3, 0.4)
        assert hybrid(0.5, 0.4) > base
        assert hybrid(0.3, 0.6) > base


class TestFoldFts:
    def test_no_fts_matches_falls_back_to_vector(self) -> None:
        # No FTS signal at all → combined == vector score (since
        # hybrid(v, 0) == v) and no penalty applies (no strong FTS).
        merged = {"u1": ("entity-1", 0.7), "u2": ("entity-2", 0.4)}
        out = fold_fts(merged, fts_matches={})
        assert out["u1"][1] == pytest.approx(0.7)
        assert out["u2"][1] == pytest.approx(0.4)
        # Entities are passed through unchanged.
        assert out["u1"][0] == "entity-1"

    def test_combined_when_both_signals_present(self) -> None:
        merged = {"u1": ("e", 0.5)}
        fts = {"u1": 0.6}
        out = fold_fts(merged, fts)
        assert out["u1"][1] == pytest.approx(hybrid(0.5, 0.6))

    def test_vector_only_penalty_when_strong_fts_exists(self) -> None:
        # u1 has a strong FTS hit (above threshold). u2 only has vector.
        # u2 should be penalized.
        strong = FTS_PRIMARY_THRESHOLD + 0.1
        merged = {
            "u1": ("e1", 0.4),
            "u2": ("e2", 0.8),
        }
        fts = {"u1": strong}
        out = fold_fts(merged, fts)

        u1_expected = hybrid(0.4, strong)
        u2_expected = hybrid(0.8, 0.0) * VECTOR_ONLY_PENALTY

        assert out["u1"][1] == pytest.approx(u1_expected)
        assert out["u2"][1] == pytest.approx(u2_expected)
        # The penalized vector-only hit must rank below the FTS hit.
        assert out["u2"][1] < out["u1"][1]

    def test_no_penalty_when_fts_below_threshold(self) -> None:
        # Weak FTS hit (below threshold) shouldn't trigger the
        # vector-only penalty — we only soften vectors when keyword is
        # the dominant signal.
        weak = FTS_PRIMARY_THRESHOLD - 0.1
        assert weak >= 0
        merged = {"u1": ("e1", 0.5), "u2": ("e2", 0.5)}
        fts = {"u1": weak}
        out = fold_fts(merged, fts)
        # u2 has no FTS → combined == its vector score, untouched.
        assert out["u2"][1] == pytest.approx(0.5)

    def test_empty_merged_returns_empty(self) -> None:
        assert fold_fts({}, {"u1": 0.9}) == {}


class TestIntersectFilters:
    def test_all_none_returns_none(self) -> None:
        # "No filter on any axis" must be distinguishable from "filtered
        # but matched nothing" — encoded as None vs empty set.
        assert intersect_filters(None, None) is None
        assert intersect_filters() is None

    def test_single_filter_returns_copy(self) -> None:
        original = {"a", "b"}
        result = intersect_filters(original)
        assert result == {"a", "b"}
        # Shouldn't return the same object — caller is free to mutate.
        assert result is not original

    def test_two_filters_intersect(self) -> None:
        assert intersect_filters({"a", "b", "c"}, {"b", "c", "d"}) == {"b", "c"}

    def test_disjoint_filters_yield_empty_set_not_none(self) -> None:
        # Empty set is the "filtered but nothing matched" signal.
        # It must NOT collapse to None (which means "unfiltered").
        result = intersect_filters({"a"}, {"b"})
        assert result == set()
        assert result is not None

    def test_none_axes_skipped(self) -> None:
        # None entries are inactive axes — they don't contribute, they
        # don't shrink the result.
        assert intersect_filters({"a", "b"}, None, {"b", "c"}) == {"b"}

    def test_three_way_intersect(self) -> None:
        assert intersect_filters({"a", "b", "c"}, {"b", "c"}, {"c"}) == {"c"}


def test_module_constants_have_sane_relations() -> None:
    """Sanity check the constants are consistent with each other.

    Cheap regression net for accidental edits like swapping FTS_PRIMARY_THRESHOLD
    and VECTOR_ONLY_PENALTY.
    """
    assert 0.0 < NEUTRAL_SCORE < 1.0
    assert 0.0 < FTS_PRIMARY_THRESHOLD < 1.0
    assert 0.0 < VECTOR_ONLY_PENALTY <= 1.0
