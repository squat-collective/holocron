"""Unit tests for the `/search` query-string parser.

The parser is the user-facing grammar for our search box, so it has to be
both lenient (unknown prefixes degrade to plain text) and predictable
(every documented alias parses exactly as advertised). These tests pin
down both halves so future grammar additions don't silently regress
queries already in the wild.
"""

import pytest

from holocron.core.services.query_parser import (
    HitKind,
    ParsedQuery,
    parse_query,
)

ALL_KINDS: set[HitKind] = {"asset", "actor", "rule", "container", "field"}


class TestEmptyAndPlainText:
    def test_empty_string(self) -> None:
        q = parse_query("")
        assert q.is_empty
        assert q.text == ""
        assert q.kinds == set()
        assert q.allowed_kinds == ALL_KINDS

    def test_whitespace_only(self) -> None:
        q = parse_query("   \t  ")
        assert q.is_empty
        assert q.text == ""

    def test_plain_text(self) -> None:
        q = parse_query("revenue dashboard")
        assert q.text == "revenue dashboard"
        assert q.kinds == set()
        assert not q.is_empty
        assert q.allowed_kinds == ALL_KINDS


class TestKindAliases:
    @pytest.mark.parametrize(
        ("alias", "kind", "asset_type", "actor_type"),
        [
            ("a",     "asset",     None,        None),
            ("ds",    "asset",     "dataset",   None),
            ("dr",    "asset",     "report",    None),
            ("dp",    "asset",     "process",   None),
            ("dsys",  "asset",     "system",    None),
            ("p",     "actor",     None,        "person"),
            ("t",     "actor",     None,        "group"),
            ("ac",    "actor",     None,        None),
            ("r",     "rule",      None,        None),
            ("c",     "container", None,        None),
            ("f",     "field",     None,        None),
        ],
    )
    def test_alias_pins_kind_and_type(
        self,
        alias: str,
        kind: str,
        asset_type: str | None,
        actor_type: str | None,
    ) -> None:
        q = parse_query(f"{alias}:revenue")
        assert q.kinds == {kind}
        assert q.asset_type == asset_type
        assert q.actor_type == actor_type
        assert q.text == "revenue"

    def test_alias_without_value_still_filters(self) -> None:
        q = parse_query("ds:")
        assert q.kinds == {"asset"}
        assert q.asset_type == "dataset"
        assert q.text == ""
        # Pure alias with no rest is not empty — it's an active filter.
        assert not q.is_empty

    def test_multiple_aliases_union(self) -> None:
        q = parse_query("ds:revenue p:leia")
        assert q.kinds == {"asset", "actor"}
        # The last alias's structured filter wins for a single-axis field.
        assert q.actor_type == "person"
        assert q.asset_type == "dataset"
        # Both rests fold into the free-text query.
        assert "revenue" in q.text and "leia" in q.text

    def test_unknown_alias_falls_through_to_text(self) -> None:
        q = parse_query("zz:something")
        # Lenient: keep the whole token as text rather than swallowing it.
        assert q.kinds == set()
        assert q.text == "zz:something"


class TestExplicitKeys:
    def test_kind_key(self) -> None:
        q = parse_query("kind:rule null check")
        assert q.kinds == {"rule"}
        assert q.text == "null check"

    def test_kind_key_invalid_value_ignored(self) -> None:
        q = parse_query("kind:bogus payload")
        # Invalid value just drops out — but `payload` survives.
        assert q.kinds == set()
        assert q.text == "payload"

    def test_type_key_asset(self) -> None:
        q = parse_query("type:dataset revenue")
        assert q.kinds == {"asset"}
        assert q.asset_type == "dataset"
        assert q.text == "revenue"

    def test_type_key_actor(self) -> None:
        q = parse_query("type:person")
        assert q.kinds == {"actor"}
        assert q.actor_type == "person"

    def test_severity_aliases(self) -> None:
        for prefix in ("sev", "severity"):
            q = parse_query(f"{prefix}:critical broken")
            assert q.kinds == {"rule"}
            assert q.severity == "critical"
            assert q.text == "broken"

    def test_severity_invalid_dropped(self) -> None:
        q = parse_query("sev:nuclear payload")
        assert q.severity is None
        assert q.kinds == set()
        assert q.text == "payload"


class TestQuotedPhrases:
    def test_bare_quoted_phrase_required(self) -> None:
        q = parse_query('revenue "Q4 2024"')
        assert q.text == "revenue"
        assert q.exact_phrases == ["q4 2024"]

    def test_multiple_quoted_phrases(self) -> None:
        q = parse_query('"Q4" sales "2024"')
        assert sorted(q.exact_phrases) == ["2024", "q4"]
        assert q.text == "sales"

    def test_empty_quotes_ignored(self) -> None:
        q = parse_query('revenue ""')
        assert q.exact_phrases == []
        assert q.text == "revenue"

    def test_keyed_quoted_value_does_not_leak_into_phrases(self) -> None:
        # Multi-word filter values must be attached to the key, not bleed
        # into exact_phrases.
        q = parse_query('owner:"Princess Leia" rebellion')
        assert q.owner == "Princess Leia"
        assert q.exact_phrases == []
        assert q.text == "rebellion"


class TestNegations:
    def test_dash_negation(self) -> None:
        q = parse_query("revenue -deprecated")
        assert q.text == "revenue"
        assert q.negations == ["deprecated"]

    def test_bang_negation(self) -> None:
        q = parse_query("revenue !legacy")
        assert q.negations == ["legacy"]

    def test_negation_strips_trailing_quote(self) -> None:
        # A stray quote stuck to a negated token (e.g. user typed `-foo"`)
        # gets stripped — verifies the `token[1:].strip('"')` branch.
        q = parse_query('revenue -legacy"')
        assert q.negations == ["legacy"]
        assert q.text == "revenue"

    def test_fully_quoted_phrase_takes_precedence_over_negation(self) -> None:
        # `_QUOTED` runs before tokenization, so `-"legacy"` has its
        # `"legacy"` swallowed as an exact phrase before the `-` ever
        # sees a token. Documented quirk: quote a word AND negate it
        # via `-quoted"word"` is not supported; users should write
        # `-legacy` for negation, `"legacy"` for required phrase.
        q = parse_query('revenue -"legacy"')
        assert q.exact_phrases == ["legacy"]
        assert q.negations == []

    def test_lone_dash_or_bang_kept_as_text(self) -> None:
        # A bare `-` or `!` (length 1) isn't a negation — it falls
        # through to text so e.g. naming a node literally `-` doesn't
        # break the parser.
        q = parse_query("revenue -")
        assert q.text == "revenue -"
        assert q.negations == []


class TestGraphFilters:
    @pytest.mark.parametrize(
        ("prefix", "attr"),
        [
            ("owner",      "owner"),
            ("member",     "member_of"),
            ("member_of",  "member_of"),
            ("uses",       "uses"),
            ("feeds",      "feeds"),
            ("rule_for",   "rule_for"),
            ("rules_for",  "rule_for"),
            ("rule",       "rule_for"),
            ("rules",      "rule_for"),
        ],
    )
    def test_bare_graph_filter(self, prefix: str, attr: str) -> None:
        q = parse_query(f"{prefix}:leia")
        assert getattr(q, attr) == "leia"
        # A graph filter alone makes the query non-empty.
        assert not q.is_empty

    def test_quoted_graph_filter_value(self) -> None:
        q = parse_query('member:"Data Platform"')
        assert q.member_of == "Data Platform"
        # Multi-word value didn't leak into kinds or phrases.
        assert q.kinds == set()
        assert q.exact_phrases == []


class TestDerivedProperties:
    def test_allowed_kinds_defaults_to_all(self) -> None:
        q = ParsedQuery()
        assert q.allowed_kinds == ALL_KINDS

    def test_allowed_kinds_returns_filtered(self) -> None:
        q = parse_query("ds:revenue")
        assert q.allowed_kinds == {"asset"}

    def test_is_empty_with_only_kinds_is_false(self) -> None:
        # An alias-only filter (e.g. "show me everything that's a rule")
        # is a meaningful query, not empty.
        q = parse_query("r:")
        assert not q.is_empty

    def test_is_empty_with_only_phrase_is_false(self) -> None:
        q = parse_query('"required"')
        assert not q.is_empty


class TestCompoundQueries:
    def test_alias_plus_negation_plus_phrase(self) -> None:
        q = parse_query('ds:sales -legacy "Q4"')
        assert q.kinds == {"asset"}
        assert q.asset_type == "dataset"
        assert q.negations == ["legacy"]
        assert q.exact_phrases == ["q4"]
        assert q.text == "sales"

    def test_owner_plus_kind_plus_text(self) -> None:
        q = parse_query("ds:revenue owner:leia")
        assert q.kinds == {"asset"}
        assert q.asset_type == "dataset"
        assert q.owner == "leia"
        assert q.text == "revenue"

    def test_severity_plus_rule_for(self) -> None:
        q = parse_query('sev:critical rule_for:"customer events"')
        assert q.kinds == {"rule"}
        assert q.severity == "critical"
        assert q.rule_for == "customer events"
