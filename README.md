# Holocron 📚

> A declarative data governance platform — a graph of every dataset, report, process, owner, and rule in your organisation, with hybrid search, lineage, a 3D map, and a plugin ecosystem to keep the catalogue in sync with reality.

---

## What it is

Holocron answers four questions every data team eventually has to answer:

1. **What data do we have?** — every dataset, report, process, system, person, team.
2. **How does it connect?** — lineage (`feeds`), ownership (`owns`), usage (`uses`), schema (`contains`), governance (`applies_to`).
3. **Who can find it?** — hybrid semantic + keyword search with a small DSL, plus a 3D galaxy map for spatial exploration.
4. **What's broken?** — orphan assets, missing owners, dangling rules, undocumented PII — surfaced by audit plugins.

Everything lives in a single Neo4j graph. The REST API is the only writer. Connectors push, exporters pull, the UI browses, and AI assistants drive it through MCP.

## Monorepo

| Package | What it is | Stack |
|---|---|---|
| [`packages/api`](packages/api) | REST API + Neo4j + plugin host + webhook dispatcher | Python 3.12 · FastAPI · Pydantic · Neo4j 5 |
| [`packages/sdk-ts`](packages/sdk-ts) | TypeScript client (Active Record + plain) | TypeScript · Bun · openapi-fetch |
| [`packages/ui`](packages/ui) | Next.js portal — search, map, wizards, extensions | Next.js 15 · React 19 · Tailwind v4 · TanStack Query |
| [`packages/mcp-server`](packages/mcp-server) | MCP server for Claude Desktop / Code | TypeScript · Bun · `@modelcontextprotocol/sdk` |
| [`packages/holocron-plugin-sdk`](packages/holocron-plugin-sdk) | Plugin contract + `holocron-plugin` CLI | Python 3.12 · pydantic · typer |
| [`packages/connector-csv`](packages/connector-csv) | CSV/TSV ingestion | Python plugin |
| [`packages/connector-excel`](packages/connector-excel) | Excel ingestion (sheets, tables, formulas, XLOOKUP lineage) | Python plugin · openpyxl |
| [`packages/connector-postgres`](packages/connector-postgres) | PostgreSQL schema introspection | Python plugin · psycopg |
| [`packages/connector-powerbi`](packages/connector-powerbi) | `.pbix` Layout JSON parsing | Python plugin |
| [`packages/exporter-excel`](packages/exporter-excel) | Catalog → single multi-tab `.xlsx` | Python plugin |
| [`packages/exporter-markdown`](packages/exporter-markdown) | Catalog → zip of Markdown pages | Python plugin |
| [`packages/audit-lineage-gaps`](packages/audit-lineage-gaps) | Hygiene audit (orphans, dead-ends, dangling rules) | Python plugin |
| [`packages/compliance-report`](packages/compliance-report) | Governance snapshot (PII, ownership, verifications) | Python plugin |
| [`packages/pii-detector`](packages/pii-detector) | Field-name PII classifier (read-only) | Python plugin |

## Quick start

```bash
curl -fsSL https://github.com/squat-collective/holocron/releases/latest/download/install.sh | bash
```

That pulls pre-built images from GHCR, generates a strong Neo4j password, brings up the stack, and waits until `/health` is green. Needs `docker` or `podman` with the `compose` plugin — nothing else.

| Service | URL | Notes |
|---|---|---|
| UI | <http://localhost:3333> | Search + galaxy map + wizards |
| API | <http://localhost:8100> | Swagger at `/docs`, OpenAPI at `/openapi.json` |
| Neo4j Browser | <http://localhost:7474> | `neo4j` / password in `./holocron/.env` |

Pin a release: `… | HOLOCRON_VERSION=v0.1.0 bash`. Public deploys: see the **[Caddy overlay](docs/deployment.md#2-caddy-overlay-public-facing)** for auto-HTTPS + basic auth.

Images live at `ghcr.io/squat-collective/holocron-{api,ui}` (multi-arch: amd64 + arm64).

## Documentation

Start at **[`docs/README.md`](docs/README.md)** — the documentation index.

Direct links:

- **[Getting started](docs/getting-started.md)** — bring up the stack, create your first asset, import a CSV.
- **[Concepts](docs/concepts.md)** — assets, actors, relations, rules, schema projection, lineage vocabulary.
- **[Architecture](docs/architecture/specs/current-architecture.md)** — system-level overview as it stands today.
- **[Search](docs/search.md)** — hybrid vector + fulltext, the query DSL (`ds:`, `owner:`, `feeds:`, `"phrase"`, `-exclude`).
- **[3D Galaxy Map](docs/map.md)** — exploration, focus, multi-lock, keyboard nav.
- **[Plugins](docs/plugins.md)** — catalog of built-ins, the SDK, the CLI, how to write one.
- **[Webhooks](docs/webhooks.md)** — outbound events, HMAC signing, retry & auto-disable.
- **[UI Extensions](docs/extensions.md)** — the in-UI command framework powering ⌘K.
- **[Deployment](docs/deployment.md)** — Docker compose, env vars, ports, scaling notes.
- **[Development](docs/development.md)** — TDD, monorepo workflow, testing, linting.
- **[Glossary](docs/glossary.md)** — every term in one place.
- **[ADRs](docs/architecture/adr/)** — recorded decisions (Neo4j, FastAPI, multi-label nodes, hybrid search, plugin SDK, webhooks, schema projection).
- **[OpenAPI spec](docs/openapi.json)** — generated, source of truth for the SDK.

## Build from source (contributors)

```bash
git clone https://github.com/squat-collective/holocron.git && cd holocron
make up                # builds API locally, runs UI as `bun dev`, mounts source
make health            # smoke check
make logs              # tail everything
make down

# JS workspaces (sdk-ts + ui + mcp-server)
make install
make build-sdk         # UI consumes dist/

# Per-package targets are forwarded
make api-test          # pytest in API container
make api-lint          # ruff
make api-typecheck     # mypy --strict
make ui-dev            # Next dev server (host)
make sdk-build         # bun build of the SDK
make openapi           # regenerate docs/openapi.json
```

The dev compose builds `packages/api/Dockerfile` with `INSTALL_EXTRAS=[dev]` so pytest/mypy/ruff land in the container. Released GHCR images skip those (~94 MB lighter).

Per-package conventions live in each package's `CLAUDE.md`. The TL;DR is **TDD, strict types, containerised, KISS, no host installs.**

## Architecture at a glance

```
                ┌──────────────────────────────────────────┐
   AI clients ──┤  MCP server (stdio)                       │──┐
                └──────────────────────────────────────────┘  │
                ┌──────────────────────────────────────────┐  │
   Browser ─────┤  UI (Next.js 15)                          │──┤
                │   ├─ search shell + galaxy map            │  │
                │   ├─ wizards + entity pickers             │  │
                │   └─ extension framework (⌘K)             │  │
                └──────────────────────────────────────────┘  │
                ┌──────────────────────────────────────────┐  │
   Scripts/CI ──┤  TypeScript SDK + holocron-plugin CLI     │──┤
                └──────────────────────────────────────────┘  │
                                                              ▼
                ┌──────────────────────────────────────────────┐
                │                REST API (FastAPI)             │
                │                  /api/v1/...                  │
                │  ┌───────────┐ ┌───────────┐ ┌────────────┐  │
                │  │  Routes   │→│ Services  │→│ Repositor. │  │
                │  └───────────┘ └───────────┘ └────────────┘  │
                │  ┌───────────────┐  ┌────────────────────┐   │
                │  │ Plugin host   │  │ Webhook dispatcher │   │
                │  │ (entry-point) │  │ (HMAC-SHA256)      │   │
                │  └───────────────┘  └────────────────────┘   │
                └──────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌──────────────────────┐
                          │   Neo4j 5 (+ APOC)   │
                          │   vector + FTS idx   │
                          └──────────────────────┘
```

## License

MIT
