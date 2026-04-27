"""Tiny parser for the `/search` query syntax.

Users can prefix tokens with short aliases to narrow the search, wrap a
phrase in quotes to require its substring, or prefix a word with `-` / `!`
to exclude it. Everything left over is the free-text "semantic" query that
feeds the vector index.

Examples
--------

    ds:customers           → only datasets, semantically close to "customers"
    p:Tom owns             → only people, semantic query "Tom owns"
    r:null check           → rule-only, semantic query "null check"
    revenue "Q4"           → semantic query "revenue", plus a hard
                              requirement that results mention "Q4" literally
    revenue -deprecated    → semantic query "revenue", excluding anything
                              mentioning "deprecated"

Aliases
-------

Each alias maps to a kind and (optionally) a structured filter. Users can
stack aliases in one query: `ds:sales -legacy "Q4"` filters to datasets,
excludes "legacy", requires the phrase "Q4", and runs semantic search on
"sales".

    a:     any asset kind
    ds:    asset, type=dataset
    dr:    asset, type=report
    dp:    asset, type=process
    dsys:  asset, type=system
    p:     actor, type=person
    t:     actor, type=group  (team)
    ac:    actor (any type)
    r:     rule
    sev:   rule severity filter (e.g. sev:critical)
    c:     container (schema)
    f:     field (schema)

The parser is intentionally lenient: unrecognized prefixes fall back to
bare text so future grammar additions don't accidentally break queries
already in the wild.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

HitKind = Literal["asset", "actor", "rule", "container", "field"]

_ALIASES: dict[str, dict[str, str | HitKind]] = {
    "a":     {"kind": "asset"},
    "ds":    {"kind": "asset", "asset_type": "dataset"},
    "dr":    {"kind": "asset", "asset_type": "report"},
    "dp":    {"kind": "asset", "asset_type": "process"},
    "dsys":  {"kind": "asset", "asset_type": "system"},
    "p":     {"kind": "actor", "actor_type": "person"},
    "t":     {"kind": "actor", "actor_type": "group"},
    "ac":    {"kind": "actor"},
    "r":     {"kind": "rule"},
    "c":     {"kind": "container"},
    "f":     {"kind": "field"},
}

_ALL_KINDS: set[HitKind] = {"asset", "actor", "rule", "container", "field"}
_VALID_ASSET_TYPES = {"dataset", "report", "process", "system"}
_VALID_ACTOR_TYPES = {"person", "group"}
_VALID_SEVERITIES = {"info", "warning", "critical"}


@dataclass
class ParsedQuery:
    """Result of parsing a raw search string.

    `kinds` is empty when the user hasn't filtered — the caller should
    interpret that as "all kinds allowed". Filter fields are `None` when
    unset.
    """

    kinds: set[HitKind] = field(default_factory=set)
    asset_type: str | None = None
    actor_type: str | None = None
    severity: str | None = None
    exact_phrases: list[str] = field(default_factory=list)
    negations: list[str] = field(default_factory=list)
    text: str = ""
    # Graph-aware filters. Each is a free-text match on the target
    # entity's name — resolved server-side via FTS before the search,
    # then intersected with the candidate result set.
    owner: str | None = None         # entities owned by this actor
    member_of: str | None = None     # actors who are members of this team
    uses: str | None = None          # entities that have USES → target
    feeds: str | None = None         # entities upstream of target (FEEDS →)
    rule_for: str | None = None      # rules that APPLIES_TO → target

    @property
    def allowed_kinds(self) -> set[HitKind]:
        """Kinds the caller should return hits for. Defaults to all."""
        return self.kinds or set(_ALL_KINDS)

    @property
    def is_empty(self) -> bool:
        """True when there's nothing actionable — neither a semantic query
        nor any hard filter. Signals that the caller should short-circuit
        and return an empty response."""
        return (
            not self.text.strip()
            and not self.exact_phrases
            and not self.negations
            and not self.kinds
            and self.asset_type is None
            and self.actor_type is None
            and self.severity is None
            and self.owner is None
            and self.member_of is None
            and self.uses is None
            and self.feeds is None
            and self.rule_for is None
        )


# Keyed-value quoted match — `prefix:"multi word value"`. Handled before
# the generic quote-swallower so multi-word filter values don't leak into
# exact_phrases.
_KEYED_QUOTED = re.compile(r'(\w+):"([^"]*)"')
# Bare quoted phrases — required substring match, not attached to a key.
_QUOTED = re.compile(r'"([^"]*)"')


def parse_query(raw: str) -> ParsedQuery:
    """Parse a user-entered query string into filters + free text.

    Never raises — unknown prefixes degrade to plain text. This is
    deliberately forgiving because the input comes straight from a search
    input.
    """
    q = raw.strip()
    if not q:
        return ParsedQuery()

    out = ParsedQuery()

    # 1. Extract `prefix:"multi word"` first — these become a single token
    # that `split()` won't cut. We replace them with a placeholder that's
    # prefix:<base64-like-but-space-free> to keep the pipeline simple.
    keyed_values: dict[str, str] = {}
    def _swallow_keyed(m: re.Match[str]) -> str:
        prefix = m.group(1)
        value = m.group(2).strip()
        if not value:
            return " "
        marker = f"__kv{len(keyed_values)}__"
        keyed_values[marker] = value
        return f"{prefix}:{marker}"

    q = _KEYED_QUOTED.sub(_swallow_keyed, q)

    # 2. Bare quoted phrases left over → exact_phrases.
    def _swallow_quoted(m: re.Match[str]) -> str:
        phrase = m.group(1).strip()
        if phrase:
            out.exact_phrases.append(phrase.lower())
        return " "

    q = _QUOTED.sub(_swallow_quoted, q)

    text_tokens: list[str] = []
    for token in q.split():
        # Negation: -foo or !foo
        if token.startswith(("-", "!")) and len(token) > 1:
            neg = token[1:].strip('"')
            if neg:
                out.negations.append(neg.lower())
            continue

        # key:value
        if ":" in token:
            prefix, _, rest = token.partition(":")
            prefix = prefix.lower()

            # Generic explicit keys.
            if prefix == "kind":
                kind = rest.lower().strip()
                if kind in _ALL_KINDS:
                    out.kinds.add(kind)  # type: ignore[arg-type]
                continue
            if prefix == "type":
                val = rest.lower().strip()
                if val in _VALID_ASSET_TYPES:
                    out.asset_type = val
                    out.kinds.add("asset")
                elif val in _VALID_ACTOR_TYPES:
                    out.actor_type = val
                    out.kinds.add("actor")
                continue
            if prefix == "sev" or prefix == "severity":
                val = rest.lower().strip()
                if val in _VALID_SEVERITIES:
                    out.severity = val
                    out.kinds.add("rule")
                continue

            # Graph-aware filters. Values are free-text names resolved
            # server-side via FTS, so multi-word values need quotes:
            #   owner:"Princess Leia"     member:"Data Platform"
            # A bare word works too: owner:leia.
            if prefix == "owner":
                val = keyed_values.get(rest.strip(), rest.strip())
                if val:
                    out.owner = val
                continue
            if prefix in ("member", "member_of"):
                val = keyed_values.get(rest.strip(), rest.strip())
                if val:
                    out.member_of = val
                continue
            if prefix == "uses":
                val = keyed_values.get(rest.strip(), rest.strip())
                if val:
                    out.uses = val
                continue
            if prefix == "feeds":
                val = keyed_values.get(rest.strip(), rest.strip())
                if val:
                    out.feeds = val
                continue
            if prefix in ("rule_for", "rules_for", "rule", "rules"):
                val = keyed_values.get(rest.strip(), rest.strip())
                if val:
                    out.rule_for = val
                continue

            # Short aliases (ds:, p:, r:, …).
            alias = _ALIASES.get(prefix)
            if alias is not None:
                kind = alias["kind"]  # type: ignore[assignment]
                out.kinds.add(kind)
                at = alias.get("asset_type")
                act = alias.get("actor_type")
                if isinstance(at, str):
                    out.asset_type = at
                if isinstance(act, str):
                    out.actor_type = act
                if rest.strip():
                    text_tokens.append(rest)
                continue

            # Unknown prefix — fall through and treat the whole token as
            # plain text. Mildly weird but better than silently dropping.
            text_tokens.append(token)
            continue

        text_tokens.append(token)

    out.text = " ".join(text_tokens).strip()
    return out
