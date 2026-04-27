"""Pure analysis layer — turn a snapshot into structured compliance rows.

The audit plugin's job is "find what's broken". This plugin's job is the
opposite: enumerate what's *true* about governance — who owns what,
which rules are in force, where PII lives, who's been verified. Pure
functions, easy to unit-test against fixtures.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from compliance_report.models import (
    ActorRecord,
    AssetRecord,
    CatalogSnapshot,
)


@dataclass(frozen=True)
class CoverageStats:
    """Aggregate coverage percentages for the Overview sheet."""

    assets_total: int
    assets_with_owner: int
    assets_with_description: int
    assets_verified: int
    actors_total: int
    actors_verified: int
    rules_total: int
    rules_verified: int
    rules_applied: int
    pii_field_count: int

    def pct(self, numerator: int, denominator: int) -> float:
        """Coverage percent, gracefully handling an empty denominator.

        We return 0.0 rather than NaN so the resulting xlsx cell is a
        plain number — easier to filter/sort against in Excel/Numbers
        than the spreadsheet equivalent of NaN.
        """
        if denominator == 0:
            return 0.0
        return round(100.0 * numerator / denominator, 1)


@dataclass(frozen=True)
class RuleApplication:
    """One (rule, asset) pair from an `applies_to` relation."""

    rule_uid: str
    rule_name: str
    severity: str
    category: str
    asset_uid: str
    asset_name: str
    enforcement: str  # "" if absent
    field_path: str  # "" when applied to the asset as a whole


@dataclass(frozen=True)
class PIIField:
    """One PII-flagged schema field."""

    asset_uid: str
    asset_name: str
    field_path: str
    data_type: str
    description: str
    owner_names: str  # comma-separated; empty when no owner is recorded


@dataclass(frozen=True)
class OwnershipRow:
    """One actor → asset edge from an `owns` relation."""

    actor_uid: str
    actor_name: str
    actor_type: str
    asset_uid: str
    asset_name: str
    asset_type: str


@dataclass(frozen=True)
class VerificationEntry:
    """One verified entity row, intended to be sorted by `updated_at`
    for a 'recent verifications' log."""

    entity_kind: str
    entity_uid: str
    entity_name: str
    entity_type: str
    discovered_by: str
    updated_at: str


@dataclass(frozen=True)
class ComplianceReport:
    """Bundled output the workbook renders."""

    coverage: CoverageStats
    rule_applications: list[RuleApplication]
    pii_fields: list[PIIField]
    ownership_rows: list[OwnershipRow]
    verifications: list[VerificationEntry]


def build_coverage(snapshot: CatalogSnapshot) -> CoverageStats:
    """Aggregate counts + %s for the Overview tab."""
    owned_uids = {r.to_uid for r in snapshot.relations if r.type == "owns"}
    applied_rule_uids = {
        r.from_uid for r in snapshot.relations if r.type == "applies_to"
    }
    pii_count = sum(
        1
        for asset in snapshot.assets
        for _ in _walk_pii_fields(asset.metadata.get("schema"))
    )
    return CoverageStats(
        assets_total=len(snapshot.assets),
        assets_with_owner=sum(1 for a in snapshot.assets if a.uid in owned_uids),
        assets_with_description=sum(
            1
            for a in snapshot.assets
            if a.description and a.description.strip()
        ),
        assets_verified=sum(1 for a in snapshot.assets if a.verified),
        actors_total=len(snapshot.actors),
        actors_verified=sum(1 for a in snapshot.actors if a.verified),
        rules_total=len(snapshot.rules),
        rules_verified=sum(1 for r in snapshot.rules if r.verified),
        rules_applied=sum(1 for r in snapshot.rules if r.uid in applied_rule_uids),
        pii_field_count=pii_count,
    )


def build_rule_applications(snapshot: CatalogSnapshot) -> list[RuleApplication]:
    """Every rule × asset pair from the `applies_to` graph.

    Skips relations whose `from_uid` doesn't resolve to a known rule
    (defensive — shouldn't happen in a clean DB but doesn't crash if it
    does)."""
    rules = {r.uid: r for r in snapshot.rules}
    assets = {a.uid: a for a in snapshot.assets}
    out: list[RuleApplication] = []
    for rel in snapshot.relations:
        if rel.type != "applies_to":
            continue
        rule = rules.get(rel.from_uid)
        asset = assets.get(rel.to_uid)
        if rule is None or asset is None:
            continue
        out.append(
            RuleApplication(
                rule_uid=rule.uid,
                rule_name=rule.name,
                severity=rule.severity,
                category=rule.category or "",
                asset_uid=asset.uid,
                asset_name=asset.name,
                enforcement=str(rel.properties.get("enforcement", "")),
                field_path=str(rel.properties.get("field_path") or ""),
            )
        )
    # Sort: severity (critical first), then rule name, then asset name.
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    out.sort(
        key=lambda r: (
            severity_order.get(r.severity, 99),
            r.rule_name.lower(),
            r.asset_name.lower(),
        )
    )
    return out


def build_pii_inventory(snapshot: CatalogSnapshot) -> list[PIIField]:
    """One row per PII-flagged schema field, with owner attribution.

    Owners are looked up via the asset's incoming `owns` relations and
    joined back to the actor records to surface human names rather than
    raw uids."""
    actors = {a.uid: a for a in snapshot.actors}
    owners_by_asset = _index_owners(snapshot, actors)
    out: list[PIIField] = []
    for asset in snapshot.assets:
        for path, node in _walk_pii_fields(asset.metadata.get("schema")):
            owners = owners_by_asset.get(asset.uid, [])
            owner_names = ", ".join(o.name for o in owners)
            out.append(
                PIIField(
                    asset_uid=asset.uid,
                    asset_name=asset.name,
                    field_path=path,
                    data_type=str(node.get("dataType") or ""),
                    description=str(node.get("description") or ""),
                    owner_names=owner_names,
                )
            )
    out.sort(key=lambda f: (f.asset_name.lower(), f.field_path))
    return out


def build_ownership(snapshot: CatalogSnapshot) -> list[OwnershipRow]:
    """Flat (actor → asset) matrix from every `owns` relation."""
    actors = {a.uid: a for a in snapshot.actors}
    assets = {a.uid: a for a in snapshot.assets}
    out: list[OwnershipRow] = []
    for rel in snapshot.relations:
        if rel.type != "owns":
            continue
        actor = actors.get(rel.from_uid)
        asset = assets.get(rel.to_uid)
        if actor is None or asset is None:
            continue
        out.append(
            OwnershipRow(
                actor_uid=actor.uid,
                actor_name=actor.name,
                actor_type=actor.type,
                asset_uid=asset.uid,
                asset_name=asset.name,
                asset_type=asset.type,
            )
        )
    out.sort(key=lambda r: (r.actor_name.lower(), r.asset_name.lower()))
    return out


def build_verifications(snapshot: CatalogSnapshot) -> list[VerificationEntry]:
    """Every verified entity, sorted newest-first by updated_at — gives
    the report a 'recent activity' surface for the auditor."""
    out: list[VerificationEntry] = []
    for a in snapshot.assets:
        if a.verified:
            out.append(
                VerificationEntry(
                    entity_kind="asset",
                    entity_uid=a.uid,
                    entity_name=a.name,
                    entity_type=a.type,
                    discovered_by=a.discovered_by or "",
                    updated_at=a.updated_at.isoformat(),
                )
            )
    for actor in snapshot.actors:
        if actor.verified:
            out.append(
                VerificationEntry(
                    entity_kind="actor",
                    entity_uid=actor.uid,
                    entity_name=actor.name,
                    entity_type=actor.type,
                    discovered_by=actor.discovered_by or "",
                    updated_at=actor.updated_at.isoformat(),
                )
            )
    for rule in snapshot.rules:
        if rule.verified:
            out.append(
                VerificationEntry(
                    entity_kind="rule",
                    entity_uid=rule.uid,
                    entity_name=rule.name,
                    entity_type=rule.severity,
                    discovered_by=rule.discovered_by or "",
                    updated_at=rule.updated_at.isoformat(),
                )
            )
    out.sort(key=lambda v: v.updated_at, reverse=True)
    return out


def run_report(snapshot: CatalogSnapshot) -> ComplianceReport:
    """Run every analyzer and bundle the result."""
    return ComplianceReport(
        coverage=build_coverage(snapshot),
        rule_applications=build_rule_applications(snapshot),
        pii_fields=build_pii_inventory(snapshot),
        ownership_rows=build_ownership(snapshot),
        verifications=build_verifications(snapshot),
    )


# ---------- helpers ----------


def _walk_pii_fields(
    schema: Any, path_parts: tuple[str, ...] = ()
) -> list[tuple[str, dict[str, Any]]]:
    """Walk a (possibly None) schema tree and yield every leaf field with
    `pii: true` plus its slash-joined path."""
    if not isinstance(schema, list):
        return []
    out: list[tuple[str, dict[str, Any]]] = []
    for node in schema:
        if not isinstance(node, dict):
            continue
        name = str(node.get("name") or "")
        new_path = path_parts + ((name,) if name else ())
        if node.get("nodeType") == "container":
            out.extend(_walk_pii_fields(node.get("children"), new_path))
        elif node.get("pii"):
            out.append(("/".join(new_path), node))
    return out


def _index_owners(
    snapshot: CatalogSnapshot, actors: dict[str, ActorRecord]
) -> dict[str, list[ActorRecord]]:
    """asset_uid → list of owner ActorRecords (for PII inventory join)."""
    out: dict[str, list[ActorRecord]] = {}
    for r in snapshot.relations:
        if r.type != "owns":
            continue
        actor = actors.get(r.from_uid)
        if actor is None:
            continue
        out.setdefault(r.to_uid, []).append(actor)
    return out


# Re-export AssetRecord so the workbook layer doesn't need to know the
# plugin's models module.
__all__ = [
    "AssetRecord",
    "ComplianceReport",
    "CoverageStats",
    "OwnershipRow",
    "PIIField",
    "RuleApplication",
    "VerificationEntry",
    "build_coverage",
    "build_ownership",
    "build_pii_inventory",
    "build_rule_applications",
    "build_verifications",
    "run_report",
]
