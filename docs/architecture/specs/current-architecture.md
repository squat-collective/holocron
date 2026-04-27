# Current architecture

> The system as it stands. Supersedes [`mvp-architecture.md`](mvp-architecture.md) (January 2026).

**Date:** 2026-04-26
**Status:** Living document — kept current alongside the code.

---

## Components

```
                 ┌────────────────────────────────────────┐
   AI clients ───┤  MCP server (TypeScript, stdio)         │──┐
                 └────────────────────────────────────────┘  │
                 ┌────────────────────────────────────────┐  │
   Browser ──────┤  UI (Next.js 15, React 19)              │──┤
                 │   ├─ search shell + galaxy map          │  │
                 │   ├─ wizards + entity pickers           │  │
                 │   └─ extensions (⌘K command framework)  │  │
                 └────────────────────────────────────────┘  │
                 ┌────────────────────────────────────────┐  │
   CLI / CI ─────┤  TS SDK + holocron-plugin CLI           │──┤
                 └────────────────────────────────────────┘  │
                                                             ▼
                 ┌────────────────────────────────────────────┐
                 │            REST API (FastAPI)               │
                 │              /api/v1/...                    │
                 │  ┌───────────┐ ┌───────────┐ ┌───────────┐ │
                 │  │  Routes   │→│ Services  │→│  Repos    │ │
                 │  └───────────┘ └───────────┘ └───────────┘ │
                 │  ┌───────────────┐  ┌──────────────────┐   │
                 │  │ Plugin host   │  │ Webhook dispatch │   │
                 │  │ (entry-point) │  │ (HMAC + bg task) │   │
                 │  └───────────────┘  └──────────────────┘   │
                 └────────────────────────────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │   Neo4j 5 (+ APOC)       │
                          │   constraints + vector   │
                          │   + fulltext indexes     │
                          └──────────────────────────┘
```

| Component | Stack | Lives in |
|---|---|---|
| API | Python 3.12 · FastAPI · Pydantic v2 · neo4j-async | `packages/api` |
| Plugin contract | Python 3.12 · pydantic | `packages/holocron-plugin-sdk` |
| Built-in plugins | Python 3.12 | `packages/connector-*`, `packages/exporter-*`, `packages/audit-*`, `packages/compliance-report`, `packages/pii-detector` |
| TypeScript SDK | TS · Bun · openapi-fetch · openapi-typescript | `packages/sdk-ts` |
| UI | Next.js 15 · React 19 · TanStack Query v5 · Tailwind v4 · shadcn/ui · react-force-graph-3d | `packages/ui` |
| MCP server | TS · `@modelcontextprotocol/sdk` · zod | `packages/mcp-server` |
| Storage | Neo4j 5 with APOC, vector + fulltext indexes | bundled image |

## Data model

Single Neo4j graph. Entities: `Asset`, `Actor`, `Rule`, `Event`, `Webhook`, plus derived `Container` and `Field` from schema projection. Edges: `OWNS`, `USES`, `FEEDS`, `CONTAINS`, `MEMBER_OF`, `APPLIES_TO`. Multi-label nodes per [ADR-004](../adr/004-multi-label-node-model.md). Full reference in [`concepts.md`](../../concepts.md).

Constraints + indexes are created at startup (`packages/api/src/holocron/db/init.py`):

- Unique constraints on `uid` for every primary label.
- Vector indexes (cosine, 384-dim) on `:Asset.embedding`, `:Actor.embedding`, `:Rule.embedding`, `:Container.embedding`, `:Field.embedding`.
- Fulltext indexes on `name + description` for the same set.

## Request flow (read)

```
Browser ──► UI route handler ──► HOLOCRON_API_URL ──► FastAPI route
                                                       ├─ dependency injection (services, settings)
                                                       ├─ rate limiter
                                                       └─ service ─► repository ─► Neo4j (Bolt async)
                                                       ◄────────── response model ◄──────
```

The UI never talks to Neo4j directly. The browser never talks to the API directly — it goes through Next.js route handlers under `/api/holocron/*` so the API base URL never leaks client-side.

## Request flow (write)

Same path, plus:

1. The service writes the entity through the repository.
2. The service updates the embedding (if applicable) via `embedding_service.embed_one()`.
3. If the entity is an Asset with `metadata.schema`, the schema projection rebuilds the `:Container` / `:Field` subtree.
4. The service logs an `:Event` via `event_service.log()`.
5. `event_service` triggers `webhook_dispatcher.dispatch_event()` which fans out HMAC-signed POSTs in `asyncio` background tasks (bounded by a process-wide semaphore of 100).
6. The API response returns immediately — webhooks don't block.

## Plugin lifecycle

```
API startup
  └─ PluginRegistry.discover()
       └─ importlib.metadata.entry_points(group="holocron.plugins")
            └─ for each entry: load module, validate manifest + run, cache by slug

Runtime invocation: POST /api/v1/plugins/{slug}/run
  └─ parse multipart against manifest.inputs
       └─ build PluginContext (services from app state)
            └─ await plugin.run(ctx, inputs)
                 ├─ SummaryResult → JSON response
                 └─ DownloadResult → streaming response with Content-Disposition
```

Per [ADR-006](../adr/006-plugin-sdk-entry-points.md). The original MVP-era reader system is documented in [ADR-003](../adr/003-reader-plugin-architecture.md) and superseded by this.

## Search

Hybrid vector + fulltext, fused per kind, scored with discounts and thresholds in `core/services/search_scoring.py`. DSL parsed in `core/services/query_parser.py`. Full reference in [`search.md`](../../search.md). Design in [ADR-005](../adr/005-hybrid-search.md).

## 3D map

NetworkX `spring_layout` runs once at API startup; coordinates are cached in-process and served from `GET /api/v1/graph/map`. The UI renders with `react-force-graph-3d` + three.js CSS2D labels. Full reference in [`map.md`](../../map.md).

## Webhooks

CRUD on `:Webhook` nodes. HMAC-SHA256 signing over the raw body. Fire-and-forget dispatch via `asyncio` background tasks. 10 consecutive failures → auto-disable. No persistent retry queue in v0.1. Full reference in [`webhooks.md`](../../webhooks.md). Design in [ADR-007](../adr/007-outbound-webhooks.md).

## What changed since the MVP spec

Compared to [`mvp-architecture.md`](mvp-architecture.md):

| Then (Jan 2026) | Now (Apr 2026) |
|---|---|
| API only | API + TS SDK + UI + MCP server |
| `/readers/{name}/scan` returning suggestions for human approval | `/plugins` (entry-point discovery) running in-process with full service access |
| `:OWNS`, `:USES`, `:FEEDS`, `:DERIVED_FROM`, `:CONTAINS`, `:PRODUCES`, `:CONSUMES`, `:MEMBER_OF` | `:OWNS`, `:USES`, `:FEEDS`, `:CONTAINS`, `:MEMBER_OF`, `:APPLIES_TO` — lineage collapsed to `:FEEDS` only; `:APPLIES_TO` added for rules |
| No search | Hybrid vector + fulltext with DSL |
| No UI | Next.js portal with search + 3D map + wizards + ⌘K extensions |
| No webhooks | Outbound webhooks (HMAC, fire-and-forget, auto-disable) |
| `/assets/{uid}/lineage` route | Removed — lineage is graph traversal, surfaced via the map and the UI lineage view |
| 4 entity types | 5 + 2 derived (Container/Field via schema projection) |
| No rules | First-class `Rule` + `:APPLIES_TO` |
| No events | Audit `Event` log driving webhooks |

The MVP spec is preserved as historical context; this page is the current reference.

## Known limitations

- **No auth.** Production deployments must put a proxy in front. See [deployment.md](../../deployment.md#production-notes).
- **No soft-delete.** Hard deletes only. Recovery path is the event log + re-import.
- **Schema projection is full rebuild on every asset write.** Bounded by per-asset schema size. At scale, move to a batched/incremental rebuild.
- **Graph layout cached at startup.** Adding many entities later doesn't re-layout — restart to refresh.
- **No persistent webhook retry.** A failed delivery is not retried beyond the immediate attempt; 10 failures auto-disable.
- **Webhook secrets stored plaintext.** The dispatcher needs them to sign; treat the DB as sensitive.
- **Embedding model loads lazily.** First search after start is slower (~1 s). Pre-warm if needed.
- **Search DSL is forgiving by design.** Unknown operators silently become semantic queries.
