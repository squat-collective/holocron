"""Unit tests for the PII detector."""

from __future__ import annotations

from typing import Any

from pii_detector.detect import (
    HIGH_COMPOUND,
    HIGH_TOKENS,
    MEDIUM_COMPOUND,
    MEDIUM_TOKENS,
    Finding,
    _classify,
    _tokens,
    detect_pii,
    scan,
)


def _asset(uid: str, schema: list[dict[str, Any]] | None) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if schema is not None:
        metadata["schema"] = schema
    return {"uid": uid, "name": uid, "metadata": metadata}


def _field(name: str, *, pii: bool = False, **over: Any) -> dict[str, Any]:
    base = {"name": name, "nodeType": "field"}
    if pii:
        base["pii"] = True
    base.update(over)
    return base


def _container(name: str, children: list[dict[str, Any]]) -> dict[str, Any]:
    return {"name": name, "nodeType": "container", "children": children}


# ---------- tokenizer ----------


class TestTokens:
    def test_underscore_separated(self) -> None:
        assert _tokens("master_name") == {"master", "name"}

    def test_camel_case(self) -> None:
        assert _tokens("customerEmail") == {"customer", "email"}

    def test_acronym_then_word_camelcase(self) -> None:
        # The standard camelCase form `IPAddress` (with a second capital)
        # tokenises cleanly. The all-lowercase-after-acronym form
        # `IPaddress` is genuinely ambiguous and not supported — users
        # should write `ip_address` or `IPAddress` for detection.
        assert _tokens("IPAddress") == {"ip", "address"}

    def test_underscore_acronym(self) -> None:
        assert _tokens("IP_address") == {"ip", "address"}

    def test_digits_split_off(self) -> None:
        assert _tokens("v2_id") == {"v", "2", "id"}

    def test_empty_string_is_empty_set(self) -> None:
        assert _tokens("") == set()


# ---------- classification ----------


class TestClassify:
    def test_high_confidence_email(self) -> None:
        assert _classify("email") == ("high", "email address")
        assert _classify("email_address")[0] == "high"  # email token wins

    def test_underscore_separated_name_field(self) -> None:
        # The whole reason this plugin's classifier was rewritten — a
        # field called `master_name` should match the personal-name
        # token, not get silently skipped because of `\b` semantics.
        confidence, reason = _classify("master_name")
        assert confidence == "medium"
        assert reason == "personal name"

    def test_voiceprint_hash_high(self) -> None:
        # Real example from the seeded fixture — `speaker_voiceprint_hash`
        # should land high. This was the canary case that caught the
        # tokenizer bug in the first place.
        confidence, reason = _classify("speaker_voiceprint_hash")
        assert confidence == "high"
        assert reason == "biometric"

    def test_compound_phone_number(self) -> None:
        assert _classify("phone_number")[0] == "high"
        assert _classify("phoneNumber")[0] == "high"
        # `phone` alone is medium, not high — only the compound is high.
        assert _classify("phone") == ("medium", "phone (general)")

    def test_compound_credit_card(self) -> None:
        assert _classify("credit_card_number")[0] == "high"

    def test_compound_first_name(self) -> None:
        # "first" alone shouldn't match (too generic). first+name → medium.
        assert _classify("first_name")[0] == "medium"

    def test_unrelated_field(self) -> None:
        assert _classify("revenue_total") == (None, "")
        assert _classify("currency") == (None, "")
        assert _classify("created_at") == (None, "")

    def test_empty_name(self) -> None:
        assert _classify("") == (None, "")


# ---------- detect_pii ----------


class TestDetectPii:
    def test_high_confidence_email(self) -> None:
        out = detect_pii([_asset("a", [_field("email")])])
        assert len(out) == 1
        assert out[0].confidence == "high"

    def test_high_wins_over_medium_for_email_address(self) -> None:
        # The medium "personal name" pattern would also match a literal
        # "name" — make sure email_address goes high, not medium.
        out = detect_pii([_asset("a", [_field("email_address")])])
        assert len(out) == 1
        assert out[0].confidence == "high"

    def test_medium_confidence_first_name(self) -> None:
        out = detect_pii([_asset("a", [_field("first_name")])])
        assert len(out) == 1
        assert out[0].confidence == "medium"

    def test_unrelated_field_is_ignored(self) -> None:
        out = detect_pii([_asset("a", [_field("revenue_total")])])
        assert out == []

    def test_nested_container_walks_children(self) -> None:
        schema = [
            _container(
                "Customers",
                [
                    _field("email"),
                    _field("currency"),  # plain non-PII column
                    _container("address", [_field("street_address")]),
                ],
            )
        ]
        out = detect_pii([_asset("a", schema)])
        paths = sorted(f.field_path for f in out)
        # email matches high; street_address matches medium "postal address"
        # via the `street` token. `currency` matches nothing → not in paths.
        assert "Customers/email" in paths
        assert "Customers/address/street_address" in paths
        assert "Customers/currency" not in paths

    def test_currently_flagged_propagates(self) -> None:
        out = detect_pii([_asset("a", [_field("email", pii=True)])])
        assert out[0].currently_flagged is True

    def test_handles_missing_metadata_gracefully(self) -> None:
        # Asset with no metadata at all — the detector should skip it,
        # not crash on the dict access.
        assert detect_pii([{"uid": "a", "name": "a"}]) == []

    def test_handles_metadata_without_schema(self) -> None:
        assert detect_pii([_asset("a", schema=None)]) == []

    def test_empty_field_name_skipped(self) -> None:
        # A schema node with no name shouldn't match anything — could
        # easily produce false positives if we matched against ""
        # accidentally.
        out = detect_pii([_asset("a", [_field("")])])
        assert out == []


# ---------- token table sanity ----------


class TestTokenTables:
    """Quick coverage of the dictionaries themselves so a typo in the
    pattern data is caught at test time."""

    def test_high_tokens_are_lowercase(self) -> None:
        for token in HIGH_TOKENS:
            assert token == token.lower()

    def test_medium_tokens_are_lowercase(self) -> None:
        for token in MEDIUM_TOKENS:
            assert token == token.lower()

    def test_compounds_win_over_single_tokens(self) -> None:
        # `_classify` runs compounds before singles — that's how
        # `ip_address` lands as "geolocation / IP" instead of "postal
        # address" via the lone `address` token, and how `phone_number`
        # lands as the high "phone number" instead of medium "phone
        # (general)". This is the contract: a compound match always
        # wins.
        assert _classify("ip_address") == ("medium", "geolocation / IP")
        assert _classify("phone_number") == ("high", "phone number")


# ---------- scan + ScanReport ----------


class TestScanReport:
    def _sample(self) -> list[dict[str, Any]]:
        return [
            _asset(
                "a",
                [
                    _field("email", pii=True),  # high, already flagged
                    _field("password"),  # high, not flagged → new candidate
                    _field("first_name"),  # medium, not flagged
                    _field("revenue"),  # not PII
                ],
            ),
        ]

    def test_fields_scanned_counts_leaves_only(self) -> None:
        report = scan(self._sample())
        # Four leaves in the schema. Containers don't count; revenue
        # doesn't match a pattern but still counts as scanned.
        assert report.fields_scanned == 4

    def test_classification_buckets(self) -> None:
        report = scan(self._sample())
        assert len(report.high_confidence) == 2
        assert len(report.medium_confidence) == 1
        assert len(report.already_flagged) == 1
        # `new_candidates` excludes already-flagged.
        new_names = sorted(f.field_name for f in report.new_candidates)
        assert new_names == ["first_name", "password"]

    def test_handles_empty_catalog(self) -> None:
        report = scan([])
        assert report.fields_scanned == 0
        assert report.findings == []


# ---------- defensive ----------


class TestEdgeCases:
    def test_non_dict_node_is_skipped(self) -> None:
        # Junk in metadata.schema shouldn't crash the detector — be
        # forgiving since the field is user-controlled.
        schema: list[Any] = ["not a dict", _field("email"), 42]
        out = detect_pii([_asset("a", schema)])
        assert len(out) == 1  # only the real field matched

    def test_finding_carries_asset_metadata(self) -> None:
        out = detect_pii([_asset("a-uid", [_field("ssn")])])
        assert out[0].asset_uid == "a-uid"
        assert out[0].asset_name == "a-uid"
        assert isinstance(out[0], Finding)
