# Excel Exporter 📤

> Catalog → single `.xlsx`. Mirror of `connector-excel`.

## Module map

| File | Responsibility |
|---|---|
| `client.py` | Read-only httpx client over the Holocron API; paginates assets/actors/relations |
| `models.py` | Pydantic snapshot models (`CatalogSnapshot`) |
| `workbook.py` | `write_workbook(snapshot, path)` — generates all tabs |
| `tabs.py` | One function per tab (overview/assets/actors/relations/schemas/lineage) |
| `cli.py` | `holocron-excel-export --api-url ... --output ...` |

## Conventions

- Same toolchain as `connector-excel` (Python 3.12, hatchling, ruff, mypy strict, openpyxl)
- **No FastAPI dep** — exporter is reachable from API only via library import
- Containerized only — never install on host

## Tab design notes

- **Assets tab** keeps `metadata` as a single JSON-stringified column. Round-trips fine; humans can copy-paste into a JSON viewer.
- **Schemas tab** flattens `metadata.schema` recursively — one row per *field* (leaf), with the full path (e.g. `Customers/Customers/email`). Containers omitted (only their fields matter for grep purposes like "find all PII columns").
- **Lineage tab** unions:
  - All `feeds` relations from the API
  - All `metadata.lineage_hints` entries on assets
  Both into a single uniform schema (source, target, kind, via).

## Round-trip with connector-excel

Re-importing an exported file should be idempotent:
- UIDs are preserved in the Assets/Actors/Relations tabs
- `connector-excel`'s upsert path does `GET /assets/{uid}` first → updates instead of duplicating
