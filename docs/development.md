# Development

> How to work on Holocron without installing anything on your host.

## Ground rules

- **Containerised only.** Podman first, Docker as fallback. The `Makefile` auto-detects whichever is on `$PATH`.
- **TDD.** Write the failing test, then the code. Every package is configured to run tests in a container with one command.
- **KISS.** Build what's needed. No speculative abstractions. No half-finished features.
- **Strict types.** mypy `--strict` for Python, `strict: true` for TypeScript, no `any`.
- **One PR updates docs and code together.** If you change behaviour, update the doc that describes it.

Each package's `CLAUDE.md` has the package-specific take on these rules.

## Monorepo layout

```
holocron/
├── packages/                    # all the code
│   ├── api/                     # Python · FastAPI · Neo4j
│   ├── sdk-ts/                  # TypeScript SDK
│   ├── ui/                      # Next.js portal
│   ├── mcp-server/              # MCP server for Claude
│   ├── holocron-plugin-sdk/     # Python plugin contract + CLI
│   ├── connector-csv/           # IMPORT plugin
│   ├── connector-excel/         # IMPORT plugin
│   ├── connector-postgres/      # IMPORT plugin
│   ├── connector-powerbi/       # IMPORT plugin
│   ├── exporter-excel/          # EXPORT plugin
│   ├── exporter-markdown/       # EXPORT plugin
│   ├── audit-lineage-gaps/      # extension plugin
│   ├── compliance-report/       # extension plugin
│   └── pii-detector/            # extension plugin
├── docs/                        # all the docs you're reading
├── Makefile                     # orchestrator (forwards to packages)
├── docker-compose.yml           # full stack (neo4j + api + ui)
├── package.json                 # bun workspaces (sdk-ts + ui + mcp-server)
└── pyproject.toml               # workspace dev deps for Python tooling
```

JS workspaces ship via Bun (`bun install` at the root). Python plugins are independent packages installed editable into the API container.

## Daily commands

```bash
# Bring the dev stack up (builds API locally with [dev] extras)
make up
make health
make logs

# Run tests
make api-test            # pytest in the API container
make sdk-build           # bun build the SDK
make ui-dev              # run Next dev server on host

# Quality gates
make api-lint            # ruff
make api-typecheck       # mypy --strict
make api-format          # ruff format

# Regenerate the OpenAPI spec
make openapi             # writes docs/openapi.json from the running app
```

The root `Makefile` forwards `api-*`, `sdk-*`, `ui-*` to each package's own Makefile, so `make api-test` is just `make -C packages/api test`.

### Dev image vs released image

The dev compose builds `packages/api/Dockerfile` with `INSTALL_EXTRAS=[dev]` so pytest, mypy, and ruff land in the API container — that's why `make api-test` works. The release workflow builds the same Dockerfile **without** the arg, producing a slimmer (~94 MB lighter) GHCR image with runtime deps only. If you need to mirror the prod image locally:

```bash
podman build -f packages/api/Dockerfile -t holocron-api:slim .
```

The UI image is multi-stage (`packages/ui/Dockerfile`) and only used for releases — local dev runs Next as `bun dev` against bind-mounted source.

## Adding a feature: full loop

The "right" loop is the same regardless of which package you touch:

1. **Write the failing test.** Pytest for API, Vitest for UI, Bun test for SDK / MCP.
2. **Implement until green.**
3. **Lint + typecheck.** `make api-lint api-typecheck` (Python) or `make ui-typecheck` / `make sdk-typecheck` (TS).
4. **Run the full suite.** `make api-test`, `make ui-test`, `make sdk-test`.
5. **If you touched the API surface, regenerate docs.** `make openapi`. The SDK regenerates its types from the spec via `bun run generate-types`.
6. **Update the relevant doc page.** Don't ship behaviour changes without updating `docs/`.
7. **Commit.** Conventional-style messages (`feat(api):`, `fix(ui):`, `refactor(...)`, ...). The git history is the changelog.

## Adding an API endpoint

1. Pydantic schema in `packages/api/src/holocron/api/schemas/`.
2. Service method in `packages/api/src/holocron/core/services/`.
3. Repository method in `packages/api/src/holocron/db/repositories/` if it touches Neo4j.
4. Route in `packages/api/src/holocron/api/routes/` — call the service, raise the right exceptions.
5. Test (unit for the service, integration for the route).
6. `make openapi` to refresh `docs/openapi.json`.
7. Add a method to the SDK if it's a public API.

Patterns to copy: `routes/assets.py` is the canonical CRUD, `routes/webhooks.py` is the canonical "create returns extra-once" pattern.

## Adding a UI feature

1. Test first (Vitest + RTL).
2. If the feature needs API data, check the SDK has a method. If not, **add it to the SDK first**, rebuild (`make sdk-build`), then consume it from the UI.
3. Server components by default; `'use client'` only when you need state, effects, or browser APIs.
4. Data fetching: TanStack Query in client components, direct SDK call in server components / route handlers.
5. Style with Tailwind v4 + shadcn/ui primitives. The galaxy palette is in `globals.css` as oklch tokens.
6. If it's a command, expose it via an [extension](extensions.md) so it shows up in ⌘K.

## Adding a plugin

See [plugins.md#writing-a-plugin](plugins.md#writing-a-plugin). The TL;DR:

```bash
cp -r packages/holocron-plugin-sdk/template packages/my-plugin
# edit pyproject.toml + src/<pkg>/plugin.py
# add the bind-mount to docker-compose.yml
make restart
```

## Testing strategy

| Layer | Tool | When |
|---|---|---|
| Pure functions, scoring, parsing | pytest unit | Always. |
| API routes | pytest integration (with Neo4j fixtures) | For every endpoint. |
| SDK | Bun test (mocked fetch) | For every public method. |
| UI components | Vitest + RTL (happy-dom) | For every component with logic. |
| UI critical paths | Playwright | For critical journeys. Don't bloat with low-value flows. |

Integration tests **must hit a real Neo4j**. The compose stack provides one; `make api-test` uses it.

## Code review checklist

- [ ] Tests cover the new behaviour and exercise the failure modes.
- [ ] No new `any` / `Any`. No unjustified `# type: ignore` / `// @ts-expect-error`.
- [ ] Public API change → SDK change → UI change, in that order.
- [ ] OpenAPI spec regenerated if the API surface moved.
- [ ] Doc updated in the same PR.
- [ ] No new dependencies without a one-line rationale in the PR description.
- [ ] No commented-out code, no `console.log`, no `print` debugging left behind.
- [ ] Commit messages explain *why*, not *what*.

## Where to put things

| Question | Answer |
|---|---|
| New entity type | Pydantic model in `core/models.py`, schema in `api/schemas/`, repository in `db/repositories/`, route in `api/routes/`, ADR if it's a meaningful design choice. |
| New domain service | `core/services/<thing>_service.py` + `dependencies.py` factory. |
| New search behaviour | `core/services/search_*.py`. Add unit tests in `tests/unit/test_search_*.py`. |
| New plugin | New top-level `packages/<plugin>` package. Use the SDK template. |
| New UI page | `packages/ui/src/app/<route>/page.tsx`. |
| New UI component | `packages/ui/src/components/features/<area>/<component>.tsx`. |
| New extension command | `packages/ui/src/extensions/built-in/<name>.ts`. Register from `built-in/index.ts`. |
| New ADR | `docs/architecture/adr/NNN-short-title.md`. Don't edit existing ADRs — supersede. |
