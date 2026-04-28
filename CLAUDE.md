# Holocron 📚

> A declarative data governance platform that generates documentation about data assets, their sources, usage, and lineage.

## 🎯 Vision

- **Neo4j** stores assets, relations, groups, and metadata (single source of truth)
- **REST API** is the core interface (enables CLI, SDKs, frontends, MCP)
- **Readers** (plugins) discover assets from various sources and push to the API
- **TypeScript SDK** is the canonical client for JS/TS consumers (used by the UI)
- **Web UI** (Next.js) is the human-facing portal

## 📁 Monorepo Structure

```
holocron/
├── packages/
│   ├── api/             # Python/FastAPI backend
│   │   ├── src/holocron/
│   │   ├── plugins/     # Reader plugins (loaded at runtime)
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   ├── Dockerfile
│   │   ├── Makefile           # standalone API dev
│   │   └── docker-compose.yml # standalone API + neo4j
│   ├── sdk-ts/          # TypeScript SDK (@squat-collective/holocron-ts)
│   └── ui/              # Next.js 15 web portal (holocron-portal)
├── docs/                # Project-wide docs (architecture, ADRs, openapi.json)
├── package.json         # Bun workspaces (sdk-ts + ui)
├── Makefile             # Orchestrator (delegates to packages)
└── docker-compose.yml   # Full-stack: neo4j + api + ui
```

## 📏 Guidelines

### Development
- **Containerized** — Everything runs in Docker/Podman. Never install on host.
- **TDD** — Write tests first. No code without tests.
- **KISS** — Build only what's needed. Simple > clever.
- **API-first** — All access goes through the REST API. UI talks to API via the local SDK.

### Per-package conventions
Each package has its own `CLAUDE.md` with package-specific rules:
- `packages/api/` — Python 3.12+, FastAPI, uv, mypy strict
- `packages/sdk-ts/` — TypeScript strict, Bun, openapi-fetch, Biome
- `packages/ui/` — Next.js 15 + React 19, shadcn/ui, TanStack Query, Bun

### Commands
- **Root Makefile** — `make up` runs the full stack. `make help` lists targets.
- **Per-package** — `make api-test`, `make ui-dev`, `make sdk-build` forward to package Makefiles/scripts.
- **Workspace install** — `make install` runs `bun install` for sdk-ts + ui.

### Workspace dependencies
- `packages/ui` consumes `@squat-collective/holocron-ts` as `workspace:*` (local SDK, not npm)
- The SDK must be **built** (`make build-sdk`) before the UI can resolve it (UI reads from `dist/`)

### Documentation
- **Mandatory docs** — README per package, root `CHANGELOG.md`, `docs/` at root for cross-cutting
- **Update together** — Docs update with code in the same PR

### Changelog discipline
Every PR with user-visible impact must add an entry under `## [Unreleased]` in `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format). User-visible means: anything that changes UI behavior, API surface, install/upgrade flow, configuration, or breaking changes — anything an upgrading user would want to know about. Skip for: pure refactors with no behavior change, internal test additions, dev-only tooling, typo fixes, doc-only PRs that aren't documenting a change.

Entry format: one sentence, present tense, user-perspective. Group by intent — `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`. Don't lead with the PR number; the diff already says that. Reference issues only when they add context the entry doesn't carry on its own.

On release: rename `## [Unreleased]` to `## [vX.Y.Z] — YYYY-MM-DD` and add a fresh empty `[Unreleased]` block back at the top. The release tag is what cuts the version.

### Tech Stack
- **Backend:** Python 3.12+, FastAPI, Neo4j 5, Pydantic v2, pytest
- **SDK:** TypeScript, Bun, openapi-fetch
- **UI:** Next.js 15, React 19, Tailwind v4, shadcn/ui, TanStack Query v5

---

*"A Holocron is a repository of knowledge, containing ancient wisdom and guiding those who seek it."*
