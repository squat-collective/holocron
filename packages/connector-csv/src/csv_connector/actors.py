"""Extract actors from CSV comment headers.

Best-effort: scan the leading commented lines (``# key: value``) for owner-ish
keys and turn them into DetectedActor records.
"""

from __future__ import annotations

import re

from csv_connector.models import DetectedActor

# Keys we accept as owner-ish (case-insensitive, stripped of non-alphanumerics).
_OWNER_KEYS_RE = re.compile(
    r"^(owner|dataowner|steward|datasteward|approver|contact|maintainer|author)$",
    re.IGNORECASE,
)

# Comment line shape: leading '#' (one or more), then "key: value".
_COMMENT_KV_RE = re.compile(r"^#+\s*([A-Za-z][A-Za-z0-9_ -]*?)\s*:\s*(.+?)\s*$")

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def _normalize_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def extract_actors(comment_lines: list[str]) -> list[DetectedActor]:
    """Parse comment lines (e.g. '# Owner: jean@acme.com') into actors.

    Args:
        comment_lines: The raw lines (including the leading ``#``) that preceded
            the header/data rows.

    Returns:
        A list of DetectedActor records with ``relation_type="owns"``.
        Duplicates (by lowercased email-or-name) are collapsed.
    """
    actors: list[DetectedActor] = []

    for line in comment_lines:
        match = _COMMENT_KV_RE.match(line.rstrip("\r\n"))
        if not match:
            continue
        key, value = match.group(1).strip(), match.group(2).strip()
        if not _OWNER_KEYS_RE.match(_normalize_key(key)):
            continue
        if not value:
            continue

        email_match = _EMAIL_RE.search(value)
        email = email_match.group(0) if email_match else None
        # Strip the email out of the value for a cleaner display name
        name = (
            (value.replace(email, "").strip(" <>,;()\"'") or email) if email else value
        )

        actors.append(
            DetectedActor(
                name=name,
                email=email,
                role_hint=f"comment_header:{key}",
                relation_type="owns",
            )
        )

    # Deduplicate preserving first-seen order
    seen: set[tuple[str, str | None]] = set()
    unique: list[DetectedActor] = []
    for actor in actors:
        dedup_key = (actor.name.lower(), (actor.email or "").lower() or None)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        unique.append(actor)
    return unique
