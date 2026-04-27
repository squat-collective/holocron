# Power BI Connector 📊

Holocron plugin that ingests a `.pbix` Power BI report and registers
its referenced tables in the catalog.

## What it produces

For each .pbix uploaded:

- **One `report` asset** — the .pbix itself. Carries page/visual counts
  and the artefact inventory in metadata.
- **One `dataset` asset per referenced table** — names extracted from
  the visuals' query JSON. Columns we saw referenced land under
  `metadata.schema`.
- **One `uses` relation per (report, table) pair** — the report
  consumes each table.

UIDs are deterministic from the file name + table name. Re-uploading
the same file upserts in place rather than duplicating.

## What it does *not* parse (v0.1)

- **The Tabular DataModel** — the proprietary VertiPaq compressed
  blob. A future version can plug in `pbixray` for full table/column/
  measure extraction; right now we read only the Layout JSON.
- **Power Query (M) source code** — DataMashup is also proprietary.
- **The Connections file's data source URLs** — could be added
  cheaply (it's plain JSON) but isn't wired into the mapping yet.

## How it parses

A `.pbix` is a regular ZIP archive. Inside is a Layout JSON entry
encoded as UTF-16 LE in older PBIX, UTF-8 in newer ones — both BOM
forms are sniffed. The Layout JSON describes pages and visuals; each
visual carries a JSON-encoded `query` that follows the DAX query model
(`From: [{Entity, Name, Type}]` + `Select: [{Column: {Expression: {SourceRef: {Source}}, Property}}]`).

We walk every visual, build a per-scope alias → entity map from `From`
clauses, and resolve `Select` projections to `(table, column)` pairs.
Measures (no concrete column) surface as `(measure)` so the table
still gets a lineage edge.

Unfamiliar shapes are skipped silently — a single weird visual can't
poison the scan.
