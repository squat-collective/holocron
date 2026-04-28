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
`CHANGELOG.md` is **maintained automatically** by [release-please](https://github.com/googleapis/release-please) from conventional-commit subjects on `main`. The PR title IS the changelog entry once the PR squash-merges, so the bar shifts from "remember to edit a file" to "write a user-readable PR title."

Title format (also enforced by the `Lint PR title` workflow):
- `feat: …` → goes under **Added**
- `fix: …` → goes under **Fixed**
- `perf: …` / `deps: …` → **Changed**
- `revert: …` → **Removed**
- `docs: …` / `chore: …` / `test: …` / `ci: …` / `build: …` / `refactor: …` / `style: …` → hidden from changelog

Subject must start lowercase, be one sentence, present tense, user-perspective. Don't lead with PR numbers — the squash commit already carries them. Optional scope in parens (`fix(api): …`, `feat(ui): …`) — keep them short and focused on the affected package.

You don't normally edit `CHANGELOG.md` directly. The exceptions:
- Polishing wording on the open release-please PR before merging it (it's a normal PR — you can push commits to its branch).
- Manually adding entries that don't map to a single commit (e.g. a security advisory reference or a behaviour-change note that spans multiple commits). In that case edit the open release-please PR's `[Unreleased]` block and explain why in the commit message.

The release-please PR creates the tag on merge, which dispatches the existing `release.yml` to build and publish the multi-arch images. Pre-releases on `main` cut as `vX.Y.Z-alpha.N` (configured in `release-please-config.json`); promoting to a stable release is a manual `release-as` override on the release-please PR.

### Version-bump discipline
**Don't manually `git tag` outside release-please's flow without proposing the version + scope first and getting explicit confirmation.** A `feat:` PR with a small new flag should not become a minor bump that overstates the release. release-please's auto-derivation from conventional-commit types is the default: `feat:` → minor, `fix:` → patch, others hidden. Match the bump to the actual scope, not the highest commit type that landed.

When release-please's proposed version doesn't match the change's actual scope, override on the open release-please PR via a `Release-As: x.y.z` footer in a commit on its branch — never by tagging manually on the side. Manual tagging skips the changelog generation, the asset upload, and the audit trail.

History note: the original `v0.1.0-alpha` was cut by hand for what was actually a patch + small feature. It was re-tagged as `v0.0.4-alpha` on 2026-04-28 and the rule above was added to prevent it from happening again.

### Tech Stack
- **Backend:** Python 3.12+, FastAPI, Neo4j 5, Pydantic v2, pytest
- **SDK:** TypeScript, Bun, openapi-fetch
- **UI:** Next.js 15, React 19, Tailwind v4, shadcn/ui, TanStack Query v5

---

*"A Holocron is a repository of knowledge, containing ancient wisdom and guiding those who seek it."*
