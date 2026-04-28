"""Unit tests for the tag aggregation endpoint's pure logic.

Skip the driver round-trip — `aggregate_tags` takes raw metadata
values and returns a `TagListResponse`. Everything that matters
(normalisation, sort order, malformed-input tolerance) is in there.
"""

from __future__ import annotations

import json

from holocron.api.routes.tags import aggregate_tags


class TestAggregateTags:
    def test_empty_input(self) -> None:
        result = aggregate_tags([])
        assert result.total == 0
        assert result.tags == []

    def test_counts_distinct_tags(self) -> None:
        metadatas = [
            json.dumps({"tags": ["pii", "gold-layer"]}),
            json.dumps({"tags": ["pii"]}),
            json.dumps({"tags": ["gold-layer", "mission-critical"]}),
        ]
        result = aggregate_tags(metadatas)
        assert result.total == 3
        names = {tag.name for tag in result.tags}
        assert names == {"pii", "gold-layer", "mission-critical"}
        by_name = {tag.name: tag.count for tag in result.tags}
        assert by_name["pii"] == 2
        assert by_name["gold-layer"] == 2
        assert by_name["mission-critical"] == 1

    def test_sorted_by_count_then_name(self) -> None:
        """Most-used first; alphabetical tie-break keeps order stable
        across requests so a UI consumer can cache without seeing
        flicker."""
        metadatas = [
            json.dumps({"tags": ["b", "a", "c"]}),
            json.dumps({"tags": ["a", "c"]}),
            json.dumps({"tags": ["c"]}),
        ]
        result = aggregate_tags(metadatas)
        names = [tag.name for tag in result.tags]
        # c appears 3 times; a appears 2; b appears 1 — and 'a' wins
        # the alphabetical tie-break against any equally-counted name.
        assert names == ["c", "a", "b"]

    def test_normalises_input(self) -> None:
        """Mirrors the create wizard's normalisation: trim, strip
        leading `#`, lowercase. Without this users see `pii`, `PII`,
        `#pii` as three distinct suggestions even though the catalog
        considers them the same tag."""
        metadatas = [
            json.dumps({"tags": ["PII"]}),
            json.dumps({"tags": ["#pii"]}),
            json.dumps({"tags": ["  pii  "]}),
            json.dumps({"tags": ["pii"]}),
        ]
        result = aggregate_tags(metadatas)
        assert result.total == 1
        assert result.tags[0].name == "pii"
        assert result.tags[0].count == 4

    def test_skips_empty_after_normalisation(self) -> None:
        """`#` alone or whitespace-only entries collapse to empty
        strings — they shouldn't pollute the suggestion list."""
        metadatas = [
            json.dumps({"tags": ["#", "   ", "real-tag", ""]}),
        ]
        result = aggregate_tags(metadatas)
        assert result.total == 1
        assert result.tags[0].name == "real-tag"

    def test_tolerates_malformed_input(self) -> None:
        """Real-world data is messy. Non-string tags, dicts where a
        list was expected, garbled JSON, plain `None` — all silently
        skipped so one bad asset can't break the whole endpoint."""
        metadatas = [
            None,
            "",
            "not-json{",
            json.dumps({"tags": "single-string-not-list"}),
            json.dumps({"tags": [42, None, {"nested": "dict"}, "valid"]}),
            json.dumps({"no_tags_key": True}),
            json.dumps([1, 2, 3]),  # array at top level, not dict
        ]
        result = aggregate_tags(metadatas)
        assert result.total == 1
        assert result.tags[0].name == "valid"

    def test_handles_already_decoded_metadata(self) -> None:
        """Some call paths might hand us a dict directly (e.g. unit
        tests, in-memory shims). Don't insist on JSON encoding."""
        metadatas = [{"tags": ["hello", "world"]}]
        result = aggregate_tags(metadatas)
        assert result.total == 2
