"""Markdown rendering for catalog entities.

Each function takes the entity plus a small `RelationIndex` (precomputed
once per snapshot) and produces a self-contained Markdown document. The
renderers don't perform any I/O — `bundle.py` calls them and writes the
output to a zip.

Cross-document links are relative paths so the dictionary can be browsed
from any directory or unzipped + served as a static site.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from data_dictionary_markdown.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
    RelationRecord,
)

# Relation type names we care about for the dictionary. Anything else is
# rendered in the generic "Relations" section without dedicated headings.
KNOWN_RELATIONS = frozenset({"owns", "uses", "feeds", "contains", "member_of"})


@dataclass(frozen=True)
class RelationIndex:
    """Precomputed lookups so renderers don't re-scan the relation list per page."""

    # outgoing[uid][type] → list of relations where uid is the from_uid
    outgoing: dict[str, dict[str, list[RelationRecord]]]
    # incoming[uid][type] → list of relations where uid is the to_uid
    incoming: dict[str, dict[str, list[RelationRecord]]]
    # uid → entity record (asset OR actor) for label resolution
    by_uid: dict[str, AssetRecord | ActorRecord]

    @classmethod
    def build(cls, snapshot: CatalogSnapshot) -> RelationIndex:
        outgoing: dict[str, dict[str, list[RelationRecord]]] = {}
        incoming: dict[str, dict[str, list[RelationRecord]]] = {}
        for r in snapshot.relations:
            outgoing.setdefault(r.from_uid, {}).setdefault(r.type, []).append(r)
            incoming.setdefault(r.to_uid, {}).setdefault(r.type, []).append(r)
        by_uid: dict[str, AssetRecord | ActorRecord] = {}
        for a in snapshot.assets:
            by_uid[a.uid] = a
        for a in snapshot.actors:
            by_uid[a.uid] = a
        return cls(outgoing=outgoing, incoming=incoming, by_uid=by_uid)


def slugify(name: str, fallback: str) -> str:
    """Filesystem- and URL-safe slug. Falls back to the entity's uid when the
    name produces an empty slug (e.g. all punctuation)."""
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or fallback


def asset_path(asset: AssetRecord) -> str:
    """Path inside the zip for a given asset's page."""
    return f"assets/{slugify(asset.name, asset.uid)}.md"


def actor_path(actor: ActorRecord) -> str:
    return f"actors/{slugify(actor.name, actor.uid)}.md"


def render_asset(asset: AssetRecord, idx: RelationIndex) -> str:
    """Render a single asset to Markdown. Includes ownership, lineage, and
    schema sections — the three things a data consumer typically wants to
    see when landing on an asset page."""
    lines: list[str] = []
    lines.append(f"# {asset.name}")
    lines.append("")
    lines.append(_frontmatter_block(_asset_frontmatter(asset)))
    lines.append("")

    if asset.description:
        lines.append(asset.description)
        lines.append("")

    # --- Ownership ---
    owners = idx.incoming.get(asset.uid, {}).get("owns", [])
    if owners:
        lines.append("## Owners")
        lines.append("")
        for r in owners:
            owner = idx.by_uid.get(r.from_uid)
            lines.append(f"- {_link_actor(owner, r.from_uid, from_dir='assets')}")
        lines.append("")

    # --- Lineage ---
    upstream = idx.incoming.get(asset.uid, {}).get("feeds", [])
    upstream += idx.outgoing.get(asset.uid, {}).get("uses", [])
    downstream = idx.outgoing.get(asset.uid, {}).get("feeds", [])
    if upstream or downstream:
        lines.append("## Lineage")
        lines.append("")
        if upstream:
            lines.append("**Upstream:**")
            lines.append("")
            for r in upstream:
                # `uses` puts us on the from side; `feeds` puts us on the to side.
                other_uid = r.to_uid if r.from_uid == asset.uid else r.from_uid
                other = idx.by_uid.get(other_uid)
                lines.append(
                    f"- {_link_asset(other, other_uid, from_dir='assets')} *(via {r.type})*"
                )
            lines.append("")
        if downstream:
            lines.append("**Downstream:**")
            lines.append("")
            for r in downstream:
                other = idx.by_uid.get(r.to_uid)
                lines.append(
                    f"- {_link_asset(other, r.to_uid, from_dir='assets')} *(via {r.type})*"
                )
            lines.append("")

    # --- Schema (only renders when the asset has structured columns/fields). ---
    schema_section = _render_schema(asset.metadata.get("schema"))
    if schema_section:
        lines.append("## Schema")
        lines.append("")
        lines.append(schema_section)
        lines.append("")

    # --- Custom metadata (everything not already first-class). ---
    custom = {
        k: v for k, v in asset.metadata.items() if k != "schema" and not _is_spec_key(k)
    }
    if custom:
        lines.append("## Metadata")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(custom, indent=2, sort_keys=True, default=str))
        lines.append("```")
        lines.append("")

    return _join(lines)


def render_actor(actor: ActorRecord, idx: RelationIndex) -> str:
    """One actor → one page. Lists what they own and what they use, so the
    dictionary doubles as a 'who does what' directory."""
    lines: list[str] = []
    lines.append(f"# {actor.name}")
    lines.append("")
    lines.append(_frontmatter_block(_actor_frontmatter(actor)))
    lines.append("")
    if actor.description:
        lines.append(actor.description)
        lines.append("")

    owns = idx.outgoing.get(actor.uid, {}).get("owns", [])
    uses = idx.outgoing.get(actor.uid, {}).get("uses", [])

    if owns:
        lines.append("## Owns")
        lines.append("")
        for r in owns:
            target = idx.by_uid.get(r.to_uid)
            lines.append(f"- {_link_asset(target, r.to_uid, from_dir='actors')}")
        lines.append("")

    if uses:
        lines.append("## Uses")
        lines.append("")
        for r in uses:
            target = idx.by_uid.get(r.to_uid)
            lines.append(f"- {_link_asset(target, r.to_uid, from_dir='actors')}")
        lines.append("")

    return _join(lines)


def render_readme(snapshot: CatalogSnapshot) -> str:
    """Index page — counts, generated-at, and a flat list of every asset
    + actor with cross-links into their per-entity pages."""
    lines: list[str] = []
    lines.append("# Holocron Data Dictionary")
    lines.append("")
    lines.append(f"Generated at **{snapshot.fetched_at.isoformat()}**.")
    lines.append("")
    lines.append("## At a glance")
    lines.append("")
    lines.append(f"- **Assets:** {len(snapshot.assets)}")
    lines.append(f"- **Actors:** {len(snapshot.actors)}")
    lines.append(f"- **Relations:** {len(snapshot.relations)}")
    lines.append("")

    if snapshot.assets:
        lines.append("## Assets")
        lines.append("")
        for asset in sorted(snapshot.assets, key=lambda a: a.name.lower()):
            link = _markdown_link(asset.name, asset_path(asset))
            unverified = " *(unverified)*" if not asset.verified else ""
            lines.append(f"- {link} — `{asset.type}`{unverified}")
        lines.append("")

    if snapshot.actors:
        lines.append("## Actors")
        lines.append("")
        for actor in sorted(snapshot.actors, key=lambda a: a.name.lower()):
            link = _markdown_link(actor.name, actor_path(actor))
            unverified = " *(unverified)*" if not actor.verified else ""
            lines.append(f"- {link} — `{actor.type}`{unverified}")
        lines.append("")

    return _join(lines)


# ---------- Helpers ----------


def _join(lines: Iterable[str]) -> str:
    """Join with newlines and ensure a trailing newline.

    Trailing newline matters: most Markdown tools complain otherwise, and
    POSIX expects it from text files in archives.
    """
    return "\n".join(lines).rstrip() + "\n"


def _markdown_link(label: str, target: str) -> str:
    safe_label = label.replace("[", "\\[").replace("]", "\\]")
    return f"[{safe_label}]({target})"


def _link_asset(
    asset: AssetRecord | ActorRecord | None, uid: str, from_dir: str
) -> str:
    """Resolve to a markdown link if we know the entity; otherwise show the
    raw uid in code so the page is at least self-describing.

    `from_dir` is the directory the *referring* page lives in — `"assets"`,
    `"actors"`, or `"root"` for the README. The function picks the right
    relative prefix so the bundle is browseable as a static site without
    rewriting paths after extraction.
    """
    if asset is None or not isinstance(asset, AssetRecord):
        return f"`{uid}`"
    target = _relative("assets", from_dir, slugify(asset.name, asset.uid))
    return _markdown_link(asset.name, target)


def _link_actor(
    actor: AssetRecord | ActorRecord | None, uid: str, from_dir: str
) -> str:
    if actor is None or not isinstance(actor, ActorRecord):
        return f"`{uid}`"
    target = _relative("actors", from_dir, slugify(actor.name, actor.uid))
    return _markdown_link(actor.name, target)


def _relative(target_dir: str, from_dir: str, slug: str) -> str:
    """Build a relative path from a page in `from_dir` to a page in
    `target_dir`. Both dirs are one level deep under the bundle root."""
    if from_dir == target_dir:
        return f"{slug}.md"
    if from_dir == "root":
        return f"{target_dir}/{slug}.md"
    return f"../{target_dir}/{slug}.md"


def _asset_frontmatter(asset: AssetRecord) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = [
        ("UID", f"`{asset.uid}`"),
        ("Type", asset.type),
        ("Status", asset.status),
        ("Verified", "✅" if asset.verified else "❌"),
    ]
    if asset.location:
        rows.append(("Location", f"`{asset.location}`"))
    if asset.discovered_by:
        rows.append(("Discovered by", asset.discovered_by))
    return rows


def _actor_frontmatter(actor: ActorRecord) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = [
        ("UID", f"`{actor.uid}`"),
        ("Type", actor.type),
        ("Verified", "✅" if actor.verified else "❌"),
    ]
    if actor.email:
        rows.append(("Email", actor.email))
    if actor.discovered_by:
        rows.append(("Discovered by", actor.discovered_by))
    return rows


def _frontmatter_block(rows: list[tuple[str, str]]) -> str:
    """Two-column key/value table as Markdown. Used for the at-a-glance
    summary at the top of each entity page."""
    if not rows:
        return ""
    out = ["| Field | Value |", "| --- | --- |"]
    for key, value in rows:
        out.append(f"| {key} | {value} |")
    return "\n".join(out)


_SPEC_KEYS = frozenset(
    {
        "tool",
        "format",
        "refresh_schedule",
        "audience",
        "storage",
        "row_count",
        "pii",
        "orchestrator",
        "schedule",
        "runtime",
        "language",
        "vendor",
        "type",
        "environment",
        "api_available",
    }
)


def _is_spec_key(key: str) -> bool:
    """Spec keys live alongside metadata but are surfaced as front-matter
    rather than in the free-form Metadata block."""
    return key in _SPEC_KEYS


def _render_schema(schema: Any) -> str:
    """Render a schema tree (list of nested container/field nodes) as a
    nested Markdown bullet list. Returns an empty string when the input
    isn't a list — schemas are an opt-in metadata field, not all assets
    have one."""
    if not isinstance(schema, list) or not schema:
        return ""
    return _render_schema_nodes(schema, depth=0)


def _render_schema_nodes(nodes: list[Any], *, depth: int) -> str:
    out: list[str] = []
    indent = "  " * depth
    for node in nodes:
        if not isinstance(node, dict):
            continue
        name = node.get("name", "?")
        kind = node.get("nodeType")
        if kind == "container":
            container_type = node.get("containerType") or "container"
            out.append(f"{indent}- **{name}** *({container_type})*")
            children = node.get("children", [])
            if isinstance(children, list) and children:
                out.append(_render_schema_nodes(children, depth=depth + 1))
        else:
            data_type = node.get("dataType") or ""
            pii = " 🔒 PII" if node.get("pii") else ""
            type_part = f" — `{data_type}`" if data_type else ""
            description = node.get("description") or ""
            desc_part = f" — {description}" if description else ""
            out.append(f"{indent}- {name}{type_part}{pii}{desc_part}")
    return "\n".join(out)
