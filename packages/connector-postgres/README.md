# PostgreSQL Connector 🐘

Holocron plugin that introspects a PostgreSQL database and imports every
table in the chosen schema as a Holocron dataset asset, with column-level
schema metadata.

## Inputs

| Field | Default | Notes |
|---|---|---|
| Host | — | Hostname or IP |
| Port | 5432 | |
| Database | — | |
| User | — | |
| Password | — | Used only for this run; not persisted in the catalog |
| Schema | `public` | Internal PG schemas (`pg_catalog`, `information_schema`) are excluded |

## What it produces

One Holocron `dataset` asset per PG table or view:

- **uid** — `sha256("postgres:dataset:" + host + ":" + port + "/" + db + "/" + schema + "." + table)[:32]`. Re-running the connector against the same DB upserts in place.
- **name** — `<schema>.<table>`
- **location** — `postgresql://<host>:<port>/<db>/<schema>.<table>` (display only — no password)
- **metadata.schema** — single container with one field child per column
- **metadata.postgres** — host, port, database, schema, table, table_type
- **verified=false** + **discovered_by=postgres-connector@<version>** — consistent with other discovery plugins

## Idempotency + safety

- UIDs are deterministic, so re-runs update rather than duplicate.
- Passwords are scrubbed from any error messages before they reach the API response (psycopg occasionally echoes the connection string on failure).
- `connect_timeout=10` so an unreachable host fails fast instead of hanging the request.

## Out of scope (v0.1)

- Foreign-key inference for lineage edges.
- Row-count estimation (would need `pg_class.reltuples` or `COUNT(*)`).
- Multi-schema runs in a single click (just re-run with a different schema).
