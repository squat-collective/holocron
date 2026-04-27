# Excel Connector 📊

> Scans `.xlsx` files for Holocron — extracts sheets, tables, columns, formulas, cross-file lookups, and owners from metadata.

Part of the [Holocron monorepo](../../README.md). Used both as a standalone CLI and imported by the API for the `POST /api/v1/extensions/excel/scan` endpoint that powers the UI's "Drop a spreadsheet here" upload.

## What it discovers

| Excel concept | → | Holocron entity |
|---|---|---|
| Workbook (`.xlsx` file) | → | `System` |
| Sheet | → | `Dataset` (contained in workbook) |
| Table (ListObject or heuristic region) | → | `Dataset` (sub of sheet) |
| Column | → | column metadata on the table dataset |
| Formula referencing another sheet | → | `feeds` relation |
| `VLOOKUP`/`XLOOKUP` to external file | → | external `Dataset` + `feeds` relation |
| `core.creator`, `app.Manager`, custom-prop "Owner" | → | `Person` actor + `owns` relation |

Everything reader-discovered lands as `verified: false, discovered_by: "excel-connector@0.1.0"` so a human can confirm in the UI later.

## Standalone CLI

```bash
# Scan a file and push to a running API
holocron-excel scan ./path/to/file.xlsx --api-url http://localhost:8100

# Dry run — show what would be pushed without touching the API
holocron-excel scan ./path/to/file.xlsx --dry-run
```

## Library use (from the API)

```python
from excel_connector import scan_workbook

result = scan_workbook("/tmp/upload.xlsx")
# result.sheets, result.tables, result.actors, result.relations, ...
```

## Idempotency

UIDs are deterministic (`sha256(absolute_path + sheet + table)[:32]`). Re-scanning the same file finds existing entities and updates them rather than creating duplicates. The connector does `GET /assets/{uid}` first; 404 → POST with that uid, 200 → PUT update.

## Out of scope (v0.1)

- Pivot tables, charts, conditional formatting, macros
- Named ranges
- Recursive scan into externally-linked workbooks
- SharePoint/OneDrive metadata
