"""Pure detection layer — classify schema fields as likely-PII based on name.

The detector tokenises each field name (splitting on underscores, hyphens,
whitespace, and camelCase boundaries) and matches the resulting token
set against curated dictionaries. Tokenising rather than regex-matching
the raw string avoids the `\b`-vs-`_` footgun in Python regex (`master_name`
does not match `\bname\b` because `_` is a word character) and means each
finding has a precise reason: "matched token 'name'", not "matched some
substring somewhere."

Two confidence tiers:

  - **High**: the token leaves no real ambiguity — `email`, `ssn`,
    `voiceprint`, `password`. False positives are rare; a reviewer
    should accept these by default.
  - **Medium**: the token *might* be PII depending on context — `name`,
    `address`, `phone`, `ip`, `customer_id`. Always glance before
    applying.

Anything not matching either tier is silently skipped — no data sampling,
no heuristic on data type. Keeps the detector cheap and explainable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
#
# Each entry maps a single token (lowercase) to the human-readable reason
# the finding will carry. Keep it sorted by category for readability.

HIGH_TOKENS: dict[str, str] = {
    # Direct identifiers
    "email": "email address",
    "ssn": "SSN",
    "passport": "national ID",
    "msisdn": "phone number",
    # Credentials
    "password": "credential",
    "secret": "credential",
    # Biometric
    "voiceprint": "biometric",
    "fingerprint": "biometric",
    "biometric": "biometric",
    "retina": "biometric",
    # Financial identifiers
    "iban": "bank account",
    "bic": "bank account",
    "swift": "bank account",
    # Date of birth
    "dob": "date of birth",
}

# Compound matches: every token in the tuple must be present. Used for
# multi-word concepts where the individual tokens are too generic on
# their own (e.g. "social" + "security", "credit" + "card").
HIGH_COMPOUND: tuple[tuple[frozenset[str], str], ...] = (
    (frozenset({"social", "security"}), "SSN"),
    (frozenset({"phone", "number"}), "phone number"),
    (frozenset({"credit", "card"}), "credit card"),
    (frozenset({"national", "id"}), "national ID"),
    (frozenset({"date", "birth"}), "date of birth"),
    (frozenset({"birth", "date"}), "date of birth"),
    (frozenset({"driver", "license"}), "national ID"),
    (frozenset({"api", "key"}), "credential"),
    (frozenset({"account", "number"}), "bank account"),
)

MEDIUM_TOKENS: dict[str, str] = {
    "name": "personal name",
    "surname": "personal name",
    "firstname": "personal name",
    "lastname": "personal name",
    "fullname": "personal name",
    "address": "postal address",
    "street": "postal address",
    "postal": "postal address",
    "zip": "postal address",
    "phone": "phone (general)",
    "gender": "demographic",
    "sex": "demographic",
    "ethnicity": "demographic",
    "race": "demographic",
    "age": "age / birth",
    "birth": "age / birth",
    "birthday": "age / birth",
    "ip": "geolocation / IP",
    "ipv4": "geolocation / IP",
    "ipv6": "geolocation / IP",
    "geolocation": "geolocation / IP",
    "gps": "geolocation / IP",
    "latitude": "geolocation / IP",
    "longitude": "geolocation / IP",
}

MEDIUM_COMPOUND: tuple[tuple[frozenset[str], str], ...] = (
    (frozenset({"first", "name"}), "personal name"),
    (frozenset({"last", "name"}), "personal name"),
    (frozenset({"full", "name"}), "personal name"),
    (frozenset({"customer", "id"}), "personal identifier"),
    (frozenset({"user", "id"}), "personal identifier"),
    (frozenset({"patient", "id"}), "personal identifier"),
    (frozenset({"member", "id"}), "personal identifier"),
    (frozenset({"ip", "address"}), "geolocation / IP"),
    (frozenset({"postal", "code"}), "postal address"),
    (frozenset({"zip", "code"}), "postal address"),
)


# ---------------------------------------------------------------------------
# Tokeniser
# ---------------------------------------------------------------------------

# Pulls runs of letters or digits out of a name. Splits on underscores,
# hyphens, whitespace, and camelCase boundaries. Returns lowercased tokens.
#
# Examples:
#   "master_name"        → ["master", "name"]
#   "voiceprint_hash"    → ["voiceprint", "hash"]
#   "customerEmail"      → ["customer", "email"]
#   "IP_address"         → ["ip", "address"]
#   "claimant_hunter_id" → ["claimant", "hunter", "id"]
_TOKEN_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")


def _tokens(name: str) -> set[str]:
    return {m.group(0).lower() for m in _TOKEN_RE.finditer(name)}


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    """One detection. `currently_flagged` lets the caller diff against
    what's already in metadata — a user shouldn't see "we found 200 PII
    fields" when 198 are already known."""

    asset_uid: str
    asset_name: str
    field_path: str  # slash-joined, e.g. "Customers/email"
    field_name: str
    confidence: str  # "high" | "medium"
    reason: str
    currently_flagged: bool


def _classify(name: str) -> tuple[str | None, str]:
    """Return (confidence, reason) for a field name.

    Order of checks matters:
      1. High compounds before high singles — `phone_number` is "phone
         number" (high), not "phone (general)" (medium).
      2. High before medium — `email_address` is "email address" via the
         `email` token, not "postal address" via `address`.
      3. Medium compounds before medium singles — `ip_address` is
         "geolocation / IP" via the compound, not "postal address" via
         the lone `address` token.

    Within each tier, compounds are more specific than singles, which is
    why they're checked first.
    """
    if not name:
        return None, ""

    tokens = _tokens(name)
    if not tokens:
        return None, ""

    # High: compounds first (more specific), then single tokens.
    for required, reason in HIGH_COMPOUND:
        if required.issubset(tokens):
            return "high", reason
    for token, reason in HIGH_TOKENS.items():
        if token in tokens:
            return "high", reason
    # Medium: same shape — compounds first.
    for required, reason in MEDIUM_COMPOUND:
        if required.issubset(tokens):
            return "medium", reason
    for token, reason in MEDIUM_TOKENS.items():
        if token in tokens:
            return "medium", reason
    return None, ""


def detect_pii(assets: list[dict[str, Any]]) -> list[Finding]:
    """Walk every asset's schema metadata and return findings.

    `assets` is a list of plain dicts (not the typed snapshot models —
    keeps detection independent of the snapshot module). Each asset is
    expected to look like the API's AssetResponse: at minimum `uid`,
    `name`, and `metadata.schema`.
    """
    out: list[Finding] = []
    for asset in assets:
        schema = (asset.get("metadata") or {}).get("schema")
        if not isinstance(schema, list):
            continue
        for path, node in _walk_fields(schema):
            confidence, reason = _classify(node.get("name") or "")
            if confidence is None:
                continue
            out.append(
                Finding(
                    asset_uid=str(asset.get("uid", "")),
                    asset_name=str(asset.get("name", "")),
                    field_path=path,
                    field_name=str(node.get("name") or ""),
                    confidence=confidence,
                    reason=reason,
                    currently_flagged=bool(node.get("pii")),
                )
            )
    return out


def _walk_fields(
    schema: list[Any], path_parts: tuple[str, ...] = ()
) -> list[tuple[str, dict[str, Any]]]:
    """Walk a (possibly nested) schema tree and yield every leaf field with
    its slash-joined path. Containers contribute their name to the path
    but aren't returned themselves — only fields are scannable."""
    out: list[tuple[str, dict[str, Any]]] = []
    for node in schema:
        if not isinstance(node, dict):
            continue
        name = str(node.get("name") or "")
        new_path = path_parts + ((name,) if name else ())
        if node.get("nodeType") == "container":
            children = node.get("children")
            if isinstance(children, list):
                out.extend(_walk_fields(children, new_path))
        else:
            out.append(("/".join(new_path), node))
    return out


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ScanReport:
    """High-level numbers + the raw findings list — both shapes are useful
    to the SummaryResult the plugin returns."""

    fields_scanned: int
    findings: list[Finding]

    @property
    def candidates(self) -> list[Finding]:
        return list(self.findings)

    @property
    def high_confidence(self) -> list[Finding]:
        return [f for f in self.findings if f.confidence == "high"]

    @property
    def medium_confidence(self) -> list[Finding]:
        return [f for f in self.findings if f.confidence == "medium"]

    @property
    def already_flagged(self) -> list[Finding]:
        return [f for f in self.findings if f.currently_flagged]

    @property
    def new_candidates(self) -> list[Finding]:
        """The actionable subset: detected but not yet flagged."""
        return [f for f in self.findings if not f.currently_flagged]


def scan(assets: list[dict[str, Any]]) -> ScanReport:
    """Convenience wrapper: count fields scanned + run detection."""
    fields = sum(
        1
        for asset in assets
        for _ in _walk_fields((asset.get("metadata") or {}).get("schema") or [])
    )
    return ScanReport(fields_scanned=fields, findings=detect_pii(assets))
