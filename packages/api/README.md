# Holocron API

> Python/FastAPI backend for Holocron — REST API, Neo4j storage, plugin host, hybrid search, webhook dispatcher.

Part of the [Holocron monorepo](../../README.md). For the full picture, the data model, and the cross-cutting docs, start at the [docs index](../../docs/README.md).

## Tech

- **Python** 3.12+
- **FastAPI** + Pydantic v2 + SlowAPI (rate limiting)
- **Neo4j** 5 (async driver) — single source of truth
- **fastembed** (BAAI/bge-small-en-v1.5, ONNX, CPU) — embeddings for hybrid search
- **NetworkX** — graph layout for the 3D map (cached at startup)
- **uv** for dependency management, **ruff** + **mypy --strict**, **pytest**

## What lives here

| Surface | Where | Doc |
|---|---|---|
| REST routes (`/api/v1/...`) | `src/holocron/api/routes/` | [openapi.json](../../docs/openapi.json) · Swagger at `/docs` |
| Plugin host (entry-point discovery, `/plugins`, `/plugins/{slug}/run`) | `src/holocron/plugins/` | [docs/plugins.md](../../docs/plugins.md) |
| Hybrid search (vector + fulltext + DSL) | `src/holocron/core/services/search_*.py` | [docs/search.md](../../docs/search.md) |
| Outbound webhooks (HMAC, fire-and-forget) | `src/holocron/core/services/webhook_dispatcher.py`, `src/holocron/api/routes/webhooks.py` | [docs/webhooks.md](../../docs/webhooks.md) |
| Schema projection (JSON → Container/Field nodes) | `src/holocron/core/services/asset_schema_projection.py` | [ADR-008](../../docs/architecture/adr/008-schema-projection.md) |
| 3D map data | `src/holocron/api/routes/graph.py` + `core/services/graph_service.py` | [docs/map.md](../../docs/map.md) |
| Audit log (`Event` nodes) | `src/holocron/api/routes/events.py` | [docs/concepts.md](../../docs/concepts.md) |

## Layout

```
src/holocron/
├── api/
│   ├── routes/               # FastAPI routers (assets, actors, relations, rules,
│   │                         #   events, search, graph, webhooks, plugins, health)
│   ├── schemas/              # Pydantic request/response models
│   ├── middleware/           # logging, rate limiting
│   └── dependencies.py       # service factories (DI)
├── core/
│   ├── models.py             # domain enums + POD models
│   ├── exceptions.py         # custom exception hierarchy
│   ├── logging.py            # structured logging setup
│   └── services/             # business logic (assets, actors, relations, rules,
│                             #   events, search, embeddings, schema projection,
│                             #   webhooks, graph layout)
├── db/
│   ├── connection.py         # Neo4j async driver singleton
│   ├── init.py               # constraints + vector + fulltext indexes
│   └── repositories/         # data access (one per entity)
├── plugins/
│   ├── base.py               # re-exports SDK types for backward compat
│   ├── registry.py           # entry-point discovery + lifecycle
│   └── routes.py             # /plugins endpoints
├── config.py                 # pydantic-settings (env)
└── main.py                   # FastAPI app factory + lifespan
plugins/                      # (legacy mount point; current plugins live in
                              #  ../<plugin>/ and are bind-mounted at /opt/<plugin>)
tests/
├── unit/
└── integration/
```

## Quick commands (from the API directory)

```bash
# Standalone (just API + Neo4j) — uses ./docker-compose.yml here
make up
make down
make logs

# Tests + quality
make test                  # pytest in container
make test-cov              # with coverage
make lint                  # ruff
make typecheck             # mypy --strict
make format                # ruff format
make check                 # lint + typecheck + tests

# Local (host Python; requires Neo4j running)
make local-test
make local-lint

# Docs
make openapi               # writes ../../docs/openapi.json
```

For the full stack with the UI, run `make up` from the **repo root**.

## Build args

| Arg | Default | Purpose |
|---|---|---|
| `INSTALL_EXTRAS` | `""` | Optional extras passed to `pip install -e ".${INSTALL_EXTRAS}"`. The dev compose at the repo root sets this to `[dev]` so pytest/mypy/ruff land in the container. The release workflow leaves it empty for a slim runtime image. |

```bash
# Dev (matches what `make up` builds)
podman build --build-arg INSTALL_EXTRAS='[dev]' -f packages/api/Dockerfile -t holocron-api:dev .

# Prod (matches what GHCR ships)
podman build -f packages/api/Dockerfile -t holocron-api:slim .
```

## Configuration

| Var | Default | Purpose |
|---|---|---|
| `API_HOST` | `0.0.0.0` | Bind address |
| `API_PORT` | `8000` | Container port |
| `API_DEBUG` | `false` | Verbose logging + reload |
| `NEO4J_URI` | `bolt://localhost:7687` | Compose overrides to `bolt://neo4j:7687` |
| `NEO4J_USER` | `neo4j` | |
| `NEO4J_PASSWORD` | _(required)_ | Compose sets to `holocron` for dev |

## Routes at a glance

`/api/v1` prefix on everything.

| Group | Endpoints |
|---|---|
| Health | `GET /health` |
| Assets | `GET/POST /assets`, `GET/PUT/DELETE /assets/{uid}` |
| Actors | `GET/POST /actors`, `GET/PUT/DELETE /actors/{uid}` |
| Relations | `GET/POST /relations`, `GET/DELETE /relations/{uid}` (immutable; no PUT) |
| Rules | `GET/POST /rules`, `GET/PUT/DELETE /rules/{uid}`, `GET /rules/for-asset/{uid}` |
| Events | `GET /events`, `GET /events/{uid}` |
| Search | `GET /search?q=...` |
| Graph | `GET /graph/map?lod=0\|1` |
| Webhooks | `GET/POST /webhooks`, `GET/PUT/DELETE /webhooks/{uid}`, `POST /webhooks/{uid}/test` |
| Plugins | `GET /plugins`, `POST /plugins/{slug}/run` |

The OpenAPI spec ([`docs/openapi.json`](../../docs/openapi.json)) is the source of truth — regenerate with `make openapi`.

## Design decisions

| ADR | Topic |
|---|---|
| [001](../../docs/architecture/adr/001-neo4j-as-primary-storage.md) | Neo4j as primary storage |
| [002](../../docs/architecture/adr/002-fastapi-as-framework.md) | FastAPI as web framework |
| [003](../../docs/architecture/adr/003-reader-plugin-architecture.md) | Reader plugin architecture (superseded) |
| [004](../../docs/architecture/adr/004-multi-label-node-model.md) | Multi-label nodes |
| [005](../../docs/architecture/adr/005-hybrid-search.md) | Hybrid vector + fulltext search |
| [006](../../docs/architecture/adr/006-plugin-sdk-entry-points.md) | Plugin SDK + entry-point discovery |
| [007](../../docs/architecture/adr/007-outbound-webhooks.md) | Outbound webhooks |
| [008](../../docs/architecture/adr/008-schema-projection.md) | Schema projection |
