# Compliance Report 📋

Holocron plugin that exports the catalog's governance state as a single
`.xlsx` workbook.

Where `lineage-gap-audit` answers "what's broken?", this plugin answers
"prove what's true." Designed for sharing with auditors, security review
boards, or anyone who needs a positive snapshot of how the catalog is
currently governed.

## What it covers

| Sheet | Contents |
|---|---|
| Overview | Coverage % per metric (owners, descriptions, verification, rule application) + counts |
| Rules in force | Every rule × asset pair from the `applies_to` graph, with enforcement tier and field path |
| PII inventory | Every schema field flagged `pii: true`, joined with the owning asset and its owners |
| Ownership | Flat (actor → asset) matrix from every `owns` relation |
| Verifications | All verified entities sorted newest-first by `updated_at` — recent-activity log |

## Running it

Pick **"Compliance Report"** in the ⌘K palette under Export. The plugin
walks the catalog through the in-process service layer (assets, actors,
relations, rules), runs the pure-function analyzers, and streams the
workbook back to the browser as a download.
