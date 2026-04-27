# CSV Connector 📄

> CSV / TSV reader for Holocron. Used standalone (CLI) and imported by the API.

## Module map

| File | Responsibility |
|---|---|
| `scanner.py` | Entry point — `scan_csv(path) -> ScanResult` orchestrates encoding detection, dialect sniffing, header detection, type inference, and comment-header actor extraction |
| `columns.py` | Type inference over sampled string values — maps to `string / integer / float / boolean / date / datetime / other` |
| `actors.py` | Parses leading `# Owner: …` / `# Author: …` comment lines into `DetectedActor` records |
| `mapping.py` | Converts `ScanResult` → Holocron payloads: one `Dataset` asset with `metadata.schema` as a one-table SchemaNode tree |
| `client.py` | httpx-based idempotent check-then-create-or-update against the Holocron API |
| `cli.py` | `holocron-csv scan PATH ...` (Typer) |
| `plugin.py` | Self-registering plugin manifest + async `run()` for the API |

## Conventions

- **TDD** — programmatic CSV fixtures in `tests/conftest.py` (write strings to `tmp_path`)
- **Strict typing** — mypy strict mode, no `Any` outside boundary code
- **Containerized** — never install on host; `make test` / `make typecheck`
- **No FastAPI dep** — keeps the package importable in lightweight contexts

## UID strategy (idempotent re-scans)

```
dataset = sha256("csv:dataset:" + abs_path)[:32]
actor   = sha256("excel:actor:person:" + email_or_name.lower())[:32]
relation = sha256("csv:relation:" + source_uid + ":" + type + ":" + target_uid)[:32]
```

**Actor prefix is shared with excel-connector on purpose.** The same Jean Dupont referenced from a CSV and from a .xlsx resolves to one Holocron `Person`. If we later want format-scoped identities, we can split.

## Actor signal ranking (best-effort, comment-header only)

| Comment header | Used as |
|---|---|
| `# Owner: jean@acme.com` or `# DataOwner / Steward / Approver / Contact: …` | `owns` relation |
| `# Author: Jean Dupont` or `# Maintainer: …` | `owns` relation (authorship implies responsibility) |

Only the first ~10 lines before the header row are inspected. An email in the value is extracted into `email`; the rest becomes the display name.

## Schema-tree shape

One Dataset asset per file. `metadata.schema` is:

```json
[
  { "nodeType": "container", "containerType": "table", "name": "<file basename>",
    "children": [
      { "nodeType": "field", "dataType": "integer", "name": "id" },
      { "nodeType": "field", "dataType": "string",  "name": "name" }
    ]
  }
]
```

No sheet wrapper — CSV is flat, so the top-level containers list is one `table` node.
