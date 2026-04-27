"""Pure analysis functions — find catalog hygiene gaps in a snapshot.

Each finder returns a list of `Finding` rows. Keeping the analyzers as
plain functions of `CatalogSnapshot` (no I/O, no API calls) lets the
test suite cover the governance logic exhaustively without a live DB.
"""

from __future__ import annotations

from dataclasses import dataclass

from lineage_gap_audit.models import CatalogSnapshot

# Lineage relations are the ones that imply data flow through an asset.
# `contains` and `member_of` are structural; we don't count them as
# lineage for the purpose of dead-end detection.
LINEAGE_TYPES = frozenset({"feeds", "uses"})


@dataclass(frozen=True)
class Finding:
    """One row in the audit workbook. The `entity_kind` discriminates
    so a single mixed sheet (e.g. unverified) can carry both assets and
    actors, and the renderer can group/colour by it later."""

    entity_kind: str  # "asset" | "actor" | "rule"
    entity_uid: str
    entity_name: str
    entity_type: str  # asset.type / actor.type / rule.severity
    reason: str
    detail: str = ""


def find_orphan_assets(snapshot: CatalogSnapshot) -> list[Finding]:
    """Assets with no incoming `owns` relation — nobody on the hook."""
    owned = {r.to_uid for r in snapshot.relations if r.type == "owns"}
    return [
        Finding(
            entity_kind="asset",
            entity_uid=a.uid,
            entity_name=a.name,
            entity_type=a.type,
            reason="No owner",
        )
        for a in snapshot.assets
        if a.uid not in owned
    ]


def find_lineage_deadends(snapshot: CatalogSnapshot) -> list[Finding]:
    """Assets with no `feeds`/`uses` relations in either direction.

    A dead-end is suspicious: either the asset truly stands alone (rare
    in a real catalog) or its lineage simply hasn't been documented yet
    — in which case it shows up here as a TODO.
    """
    has_in: set[str] = set()
    has_out: set[str] = set()
    for r in snapshot.relations:
        if r.type not in LINEAGE_TYPES:
            continue
        has_in.add(r.to_uid)
        has_out.add(r.from_uid)
    return [
        Finding(
            entity_kind="asset",
            entity_uid=a.uid,
            entity_name=a.name,
            entity_type=a.type,
            reason="No lineage",
            detail="No incoming or outgoing feeds/uses",
        )
        for a in snapshot.assets
        if a.uid not in has_in and a.uid not in has_out
    ]


def find_undocumented_assets(snapshot: CatalogSnapshot) -> list[Finding]:
    """Assets with no description text. Empty-string and None both count."""
    return [
        Finding(
            entity_kind="asset",
            entity_uid=a.uid,
            entity_name=a.name,
            entity_type=a.type,
            reason="No description",
        )
        for a in snapshot.assets
        if not (a.description and a.description.strip())
    ]


def find_dangling_rules(snapshot: CatalogSnapshot) -> list[Finding]:
    """Rules that aren't applied to any asset — the policy version of an
    unread bookmark."""
    applied_rules = {r.from_uid for r in snapshot.relations if r.type == "applies_to"}
    return [
        Finding(
            entity_kind="rule",
            entity_uid=rule.uid,
            entity_name=rule.name,
            entity_type=rule.severity,
            reason="Not applied to any asset",
            detail=f"Severity: {rule.severity}",
        )
        for rule in snapshot.rules
        if rule.uid not in applied_rules
    ]


def find_unverified_entities(snapshot: CatalogSnapshot) -> list[Finding]:
    """Anything still flagged unverified across the catalog. Rolled into
    a single sheet so a reviewer can triage in one pass instead of
    bouncing between assets / actors / rules."""
    out: list[Finding] = []
    for a in snapshot.assets:
        if not a.verified:
            out.append(
                Finding(
                    entity_kind="asset",
                    entity_uid=a.uid,
                    entity_name=a.name,
                    entity_type=a.type,
                    reason="Unverified",
                    detail=f"Discovered by: {a.discovered_by or 'unknown'}",
                )
            )
    for actor in snapshot.actors:
        if not actor.verified:
            out.append(
                Finding(
                    entity_kind="actor",
                    entity_uid=actor.uid,
                    entity_name=actor.name,
                    entity_type=actor.type,
                    reason="Unverified",
                    detail=f"Discovered by: {actor.discovered_by or 'unknown'}",
                )
            )
    for rule in snapshot.rules:
        if not rule.verified:
            out.append(
                Finding(
                    entity_kind="rule",
                    entity_uid=rule.uid,
                    entity_name=rule.name,
                    entity_type=rule.severity,
                    reason="Unverified",
                    detail=f"Discovered by: {rule.discovered_by or 'unknown'}",
                )
            )
    return out


@dataclass(frozen=True)
class AuditReport:
    """All findings across all categories, plus pre-computed counts for
    the overview sheet."""

    orphan_assets: list[Finding]
    lineage_deadends: list[Finding]
    undocumented_assets: list[Finding]
    dangling_rules: list[Finding]
    unverified_entities: list[Finding]

    @property
    def total_findings(self) -> int:
        return (
            len(self.orphan_assets)
            + len(self.lineage_deadends)
            + len(self.undocumented_assets)
            + len(self.dangling_rules)
            + len(self.unverified_entities)
        )


def run_audit(snapshot: CatalogSnapshot) -> AuditReport:
    """Run every analyzer against the snapshot and bundle the findings."""
    return AuditReport(
        orphan_assets=find_orphan_assets(snapshot),
        lineage_deadends=find_lineage_deadends(snapshot),
        undocumented_assets=find_undocumented_assets(snapshot),
        dangling_rules=find_dangling_rules(snapshot),
        unverified_entities=find_unverified_entities(snapshot),
    )
