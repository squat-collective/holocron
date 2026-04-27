"""Extract actors (people/groups) from workbook metadata."""

import re
from typing import TYPE_CHECKING

from excel_connector.models import DetectedActor

if TYPE_CHECKING:
    from openpyxl.workbook.workbook import Workbook

# Custom property keys that strongly suggest ownership semantics.
# Match is case-insensitive, after stripping non-alphanumerics.
_OWNER_PROP_PATTERN = re.compile(
    r"^(owner|dataowner|steward|datasteward|approver|contact|maintainer)$",
    re.IGNORECASE,
)

# Common noise creators to filter out.
_NOISE_NAMES = {
    "",
    "microsoft office user",
    "admin",
    "user",
    "windows user",
    "anonymous",
}

_EMAIL_IN_VALUE_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def _normalize_key(key: str) -> str:
    """Strip non-alphanumerics and lowercase — for fuzzy custom-prop key matching."""
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _is_noise(name: str | None) -> bool:
    return name is None or name.strip().lower() in _NOISE_NAMES


def extract_actors(wb: "Workbook") -> list[DetectedActor]:
    """Pull all actor signals from the workbook's properties.

    Signal-strength order (strongest → weakest):
      1. Custom properties keyed Owner/DataOwner/Steward/Approver/Contact → owns
      2. core.lastModifiedBy → uses
      3. core.creator → uses (often noise; filtered if generic)

    The Manager field on app properties also maps to owns.
    """
    actors: list[DetectedActor] = []
    props = wb.properties

    # 1. Custom properties — strongest signal
    custom = getattr(wb, "custom_doc_props", None)
    if custom is not None:
        try:
            for prop in custom.props:
                if not _OWNER_PROP_PATTERN.match(_normalize_key(prop.name)):
                    continue
                value = str(prop.value) if prop.value is not None else ""
                if not value or _is_noise(value):
                    continue

                email_match = _EMAIL_IN_VALUE_RE.search(value)
                email = email_match.group(0) if email_match else None
                # Strip the email out to get a cleaner display name
                name = (
                    value.replace(email, "").strip(" <>,;()\"'") if email else value
                ) or value

                actors.append(
                    DetectedActor(
                        name=name,
                        email=email,
                        role_hint=f"custom_prop:{prop.name}",
                        relation_type="owns",
                    )
                )
        except (AttributeError, TypeError):
            # custom props can be missing or malformed; never block a scan over them
            pass

    # 2. lastModifiedBy
    last_mod = getattr(props, "lastModifiedBy", None) or getattr(props, "last_modified_by", None)
    if not _is_noise(last_mod):
        actors.append(
            DetectedActor(
                name=str(last_mod).strip(),
                email=None,
                role_hint="last_modified_by",
                relation_type="uses",
            )
        )

    # 3. creator (often noise)
    creator = getattr(props, "creator", None)
    if not _is_noise(creator):
        actors.append(
            DetectedActor(
                name=str(creator).strip(),
                email=None,
                role_hint="creator",
                relation_type="uses",
            )
        )

    # Deduplicate by (name, email) — preserve first occurrence (strongest signal first)
    seen: set[tuple[str, str | None]] = set()
    unique: list[DetectedActor] = []
    for actor in actors:
        key = (actor.name.lower(), (actor.email or "").lower() or None)
        if key in seen:
            continue
        seen.add(key)
        unique.append(actor)
    return unique
