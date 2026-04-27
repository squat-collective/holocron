# CSV Connector 📄

> Scans `.csv` / `.tsv` / `.txt` files for Holocron — detects delimiter, header, column types, and owners declared in comment headers.

Part of the [Holocron monorepo](../../README.md). Used both as a standalone CLI and imported by the API via the self-registering plugin framework.

## What it discovers

| CSV concept | → | Holocron entity |
|---|---|---|
| CSV file | → | `Dataset` asset (metadata.schema = one `table` container) |
| Column (detected header or synthetic `col_N`) | → | field node in `metadata.schema` |
| `# Owner: email@x` or `# Author: Jean Dupont` comment header | → | `Person` actor + `owns` relation |

Everything reader-discovered lands as `verified: false, discovered_by: "csv-connector@0.1.0"`.

## Structure detection

- **Encoding**: tries UTF-8 first, falls back to latin-1/cp1252 (no chardet dep — stdlib only)
- **Delimiter**: `csv.Sniffer` — comma / semicolon / tab / pipe
- **Header**: `csv.Sniffer.has_header()` — when missing, columns are named `col_0`, `col_1`, ...
- **Types**: sampled from the first ~50 data rows per column, mapped to `string / integer / float / boolean / date / datetime / other`

## Standalone CLI

```bash
holocron-csv scan ./path/to/file.csv --api-url http://localhost:8100
holocron-csv scan ./path/to/file.csv --dry-run
```

## Library use (from the API)

```python
from csv_connector import scan_csv

result = scan_csv("/tmp/upload.csv")
# result.columns, result.actors, result.delimiter, result.has_header, ...
```

## Idempotency

UIDs are deterministic:

```
dataset = sha256("csv:dataset:" + abs_path)[:32]
actor   = sha256("excel:actor:person:" + email_or_name.lower())[:32]
```

The `excel:actor:person:` prefix is **deliberately shared** with the Excel connector so the same person discovered across both CSV and XLSX sources resolves to a single Holocron `Person`.

## Out of scope (v0.1)

- Multi-file glob scanning (one CSV per invocation)
- Compressed CSVs (.csv.gz)
- JSON-Lines (.jsonl) — separate connector
- Foreign-key inference between CSVs
