# Lineage Gap Audit 🔎

Holocron plugin that scans the catalog for hygiene gaps and exports the
findings as a single `.xlsx` workbook.

## What it audits

| Sheet | Finds |
|---|---|
| Overview | Counts per category + generated-at timestamp |
| Orphan assets | Assets with no incoming `owns` relation |
| Lineage dead-ends | Assets with no `feeds`/`uses` in either direction |
| Undocumented | Assets with empty/missing description |
| Dangling rules | Rules with no `applies_to` relation |
| Unverified | Assets, actors, and rules still flagged unverified |

Each row carries the entity kind, UID, name, type/severity, the reason
it surfaced, and a short detail string — enough to triage in one pass.

## Running it

Picked from the ⌘K palette under **Export** as "Lineage Gap Audit". The
plugin walks the catalog through the in-process service layer (assets,
actors, relations, *and* rules — `PluginContext` was extended for this),
runs the pure-function analyzers, and streams the workbook back as a
download.
