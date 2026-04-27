# Holocron documentation

> Everything you need to run, use, extend, and reason about Holocron.

## Start here

| If you want to... | Read |
|---|---|
| **Install Holocron in one command** | [deployment.md](deployment.md) — `curl … install.sh \| bash` |
| **Run it locally and create your first asset** | [Getting started](getting-started.md) |
| **Understand the data model** | [Concepts](concepts.md) |
| **See the system as a whole** | [Architecture overview](architecture/specs/current-architecture.md) |
| **Look up an endpoint** | [`openapi.json`](openapi.json) — also served at <http://localhost:8100/docs> |

## Use it

| Topic | Doc |
|---|---|
| Search syntax (DSL, hybrid scoring) | [search.md](search.md) |
| 3D galaxy map (focus, lock, keyboard nav) | [map.md](map.md) |
| Outbound webhooks (HMAC, retry, auto-disable) | [webhooks.md](webhooks.md) |
| UI extension framework (⌘K commands) | [extensions.md](extensions.md) |
| TypeScript SDK | [`packages/sdk-ts/README.md`](../packages/sdk-ts/README.md) |
| MCP server (Claude Desktop / Code) | [`packages/mcp-server/README.md`](../packages/mcp-server/README.md) |

## Extend it

| Topic | Doc |
|---|---|
| Catalog of built-in plugins | [plugins.md](plugins.md) |
| Write your own plugin | [plugins.md#writing-a-plugin](plugins.md#writing-a-plugin) and [`packages/holocron-plugin-sdk/README.md`](../packages/holocron-plugin-sdk/README.md) |
| `holocron-plugin` CLI | [plugins.md#the-cli](plugins.md#the-cli) |

## Operate it

| Topic | Doc |
|---|---|
| One-click install, GHCR images, Caddy, hardening | [deployment.md](deployment.md) |
| Monorepo workflow, TDD, lint, test | [development.md](development.md) |

## Reference

- **[Glossary](glossary.md)** — every term in one place.
- **[ADRs](architecture/adr/)** — recorded technical decisions.
  - 001 · [Neo4j as primary storage](architecture/adr/001-neo4j-as-primary-storage.md)
  - 002 · [FastAPI as web framework](architecture/adr/002-fastapi-as-framework.md)
  - 003 · [Reader plugin architecture](architecture/adr/003-reader-plugin-architecture.md) (superseded by 006)
  - 004 · [Multi-label node model](architecture/adr/004-multi-label-node-model.md)
  - 005 · [Hybrid vector + fulltext search](architecture/adr/005-hybrid-search.md)
  - 006 · [Plugin SDK + entry-point discovery](architecture/adr/006-plugin-sdk-entry-points.md)
  - 007 · [Outbound webhooks (HMAC, fire-and-forget)](architecture/adr/007-outbound-webhooks.md)
  - 008 · [Schema projection (Container/Field nodes)](architecture/adr/008-schema-projection.md)
- **[Specs](architecture/specs/)**
  - [Current architecture](architecture/specs/current-architecture.md) — the system as it stands.
  - [MVP architecture](architecture/specs/mvp-architecture.md) — historical, January 2026.
- **[Research notes](architecture/research/)** — exploration sessions and code reviews.

## Conventions

- Cross-link freely. Code paths use `package/path/file.py:line` so they're clickable in editors.
- Update docs in the same PR as the code they describe.
- ADRs are append-only — supersede with a new ADR rather than rewriting history.
- The OpenAPI spec is the source of truth for the API surface; regenerate with `make openapi`.
