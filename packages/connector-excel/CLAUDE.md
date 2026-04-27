# Excel Connector 📊

> Excel `.xlsx` reader for Holocron. Used standalone (CLI) and imported by the API.

## Module map

| File | Responsibility |
|---|---|
| `workbook.py` | Entry point — `scan_workbook(path) -> ScanResult` orchestrates all extractors |
| `tables.py` | Two strategies: Excel's official `ListObject` (confidence: certain) and heuristic rectangle detection (confidence: inferred) |
| `columns.py` | Header detection, type inference (sampled), sample values |
| `formulas.py` | Regex-based extraction of precedent ranges from `=VLOOKUP/XLOOKUP/HLOOKUP/INDEX/MATCH` and direct refs |
| `external_links.py` | `workbook.external_links` → list of (referenced_file, sheet, range) |
| `actors.py` | Extracts creator/manager/lastModifiedBy/custom-prop owners with signal-strength ranking |
| `metadata.py` | Raw pass-through of core/app/custom Excel properties |
| `mapping.py` | Converts ScanResult → list of (Asset, Actor, Relation) Holocron API payloads with deterministic UIDs |
| `client.py` | httpx-based check-then-create-or-update against the Holocron API |
| `cli.py` | `holocron-excel scan PATH ...` (Typer) |

## Conventions

- **TDD** — write tests with fixture xlsx files first (built programmatically in `tests/conftest.py`), then implement
- **Strict typing** — mypy strict mode, no `Any` outside boundary code
- **Containerized** — never install on host; run via `make test` / `make typecheck`
- **No FastAPI dep** — keeps the package importable in lightweight contexts (CLI, future plugins)

## UID strategy (idempotent re-scans)

```
workbook  = sha256(abs_path)[:32]
sheet     = sha256(abs_path + "#" + sheet_name)[:32]
table     = sha256(abs_path + "#" + sheet_name + "#" + table_name)[:32]
actor     = sha256("actor:person:" + email_or_name.lower())[:32]
relation  = sha256(source_uid + ":" + type + ":" + target_uid)[:32]
```

Cross-file collisions on actor UIDs are *desired* — same person across workbooks should resolve to the same `Person`.

## Actor signal ranking

| Source | Used as |
|---|---|
| Custom prop key matching `^(owner\|data_owner\|steward\|approver\|contact)$` | `owns` relation |
| `app.Manager` | `owns` |
| `core.lastModifiedBy` (excluding noise list) | `uses` |
| `core.creator` (excluding noise: "Microsoft Office User", "Admin", "User", empty) | metadata only (too weak for `owns`) |

All discovered actors land as `verified=False, discovered_by="excel-connector@0.1.0"`.

## Formula → lineage (v0.1, regex-based)

Only three patterns:
1. Direct: `=Sheet2!A1` → `feeds(target_table, source_sheet)`
2. Lookup: `VLOOKUP/XLOOKUP/HLOOKUP/INDEX/MATCH(value, Sheet2!A:F, ...)` → `feeds`
3. External: `[Other.xlsx]Sheet!A1` → register external workbook + `feeds`

External workbooks become `Dataset` assets with `metadata: {"discovered_via": "external_link"}` and we do **not** recurse.
