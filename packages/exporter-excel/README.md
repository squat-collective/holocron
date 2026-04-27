# Excel Exporter 📤

> Pulls the Holocron catalog and writes it to a single `.xlsx` file.

The mirror of [`connector-excel`](../connector-excel) — that one *imports* spreadsheets, this one *exports* the whole catalog. Used standalone (CLI) and from the API's `GET /api/v1/extensions/excel/export` endpoint that powers the UI's "Download catalog" button.

## What's in the workbook

| Tab | Content |
|---|---|
| **Overview** | Generation timestamp, counts, source API URL |
| **Assets** | One row per asset (uid, type, name, status, verified, discovered_by, location, JSON metadata) |
| **Actors** | One row per actor (uid, type, name, email, verified, discovered_by) |
| **Relations** | One row per relation (uid, from_uid, to_uid, type, verified, properties) |
| **Schemas** | Flattened tree across all assets that carry `metadata.schema` — one row per field, with the dotted path. Lets you grep "every column tagged PII." |
| **Lineage** | Combined view of `feeds` relations + within-workbook `lineage_hints` from `metadata`. |

Verified entities show "✅", unverified show "⚠️" in a status column for quick eyeballing.

## CLI

```bash
holocron-excel-export --api-url http://localhost:8100 --output catalog.xlsx
```

## Library

```python
from excel_exporter import export_catalog

export_catalog(api_url="http://localhost:8100", output_path="catalog.xlsx")
```

## Round-trip

The workbook can be re-imported by `connector-excel` since UIDs are preserved in the Assets tab — handy for offline review + merge workflows.
