# Holocron Portal 🌌

> The web app for Holocron — search, 3D galaxy map, wizards, ⌘K extensions, governance views.

Part of the [Holocron monorepo](../../README.md). Cross-cutting docs live in [`docs/`](../../docs/README.md).

## Tech

- **Next.js 15** (App Router) · **React 19**
- **TypeScript** strict, **Biome** lint+format, **Bun** runtime
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives) · galaxy theme via oklch tokens
- **TanStack Query v5** for client-side data
- **react-force-graph-3d** + **three.js** (CSS2D labels) for the galaxy map
- **@xyflow/react** for the lineage flow view
- **Vitest** + **React Testing Library** for unit / integration; **Playwright** for E2E
- API client: **`@squat-collective/holocron-ts`** (workspace, in-tree at `../sdk-ts`)

## What it does

| Feature | Where to look | Doc |
|---|---|---|
| Search shell + 3D galaxy map (mode toggle on home) | `src/app/page.tsx`, `src/components/features/galaxy-map/`, `src/components/features/search/` | [docs/search.md](../../docs/search.md), [docs/map.md](../../docs/map.md) |
| Asset / actor / rule detail pages | `src/app/assets/[uid]/`, `src/app/actors/[uid]/`, `src/app/rules/[uid]/` | [docs/concepts.md](../../docs/concepts.md) |
| Wizards (create / edit / apply rule / run plugin) | `src/components/features/*-wizard.tsx` | — |
| ⌘K command palette + extensions | `src/components/layout/command-palette.tsx`, `src/extensions/` | [docs/extensions.md](../../docs/extensions.md) |
| Plugin invocation (auto-rendered forms) | `src/extensions/plugins-adapter.tsx`, `src/hooks/use-plugins.ts` | [docs/plugins.md](../../docs/plugins.md) |
| Galaxy nebula background (parallax + warp) | `src/components/layout/galaxy-background.tsx` | — |

## Architecture

```
Browser (client component)
   └─ TanStack Query hook
        └─ fetch("/api/holocron/<resource>")
             └─ Next.js route handler  (src/app/api/holocron/.../route.ts)
                  └─ holocron singleton (src/lib/holocron.ts)
                       └─ Python API   (HOLOCRON_API_URL)
```

The browser **never** talks to the Python API directly. All requests are proxied through Next.js route handlers under `/api/holocron/*`, which use the in-tree SDK against `HOLOCRON_API_URL`. That keeps the API base URL server-side and lets us add auth in one place later.

Server components fetch via the SDK directly; client components use TanStack Query against the proxy routes.

## Layout

```
src/
├── app/
│   ├── page.tsx                # home shell (search + galaxy mode toggle)
│   ├── assets/[uid]/page.tsx   # asset detail
│   ├── actors/[uid]/page.tsx   # actor detail
│   ├── rules/[uid]/page.tsx    # rule detail
│   ├── map/page.tsx            # legacy → /?mode=map
│   └── api/holocron/           # SDK proxy routes
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── layout/                 # Header, CommandPalette, GalaxyBackground, WizardHost
│   └── features/
│       ├── assets/             # asset views + wizards
│       ├── actors/
│       ├── rules/
│       ├── search/             # input, hit row, preview pane
│       ├── galaxy-map/         # 3D map (react-force-graph-3d)
│       ├── lineage/            # flow view (@xyflow)
│       ├── home/               # mode toggle + hero
│       ├── schema/             # schema browser (containers + fields)
│       └── *-wizard.tsx        # multi-step forms
├── extensions/
│   ├── types.ts                # Extension + ExtensionContext
│   ├── host.tsx                # mounts under layout
│   ├── registry.ts             # registerExtension(), computeCommands(ctx)
│   ├── plugins-adapter.tsx     # API plugins → palette commands
│   └── built-in/               # ~15 built-in extensions
├── hooks/                      # use-asset, use-catalog-search, use-graph-map,
│                               #   use-cosmic-nav, use-plugins, ...
├── lib/                        # holocron singleton, query keys, api-route helpers,
│                               #   stores (commands, galaxy, wizard), entity styles
└── types/                      # app-specific types
```

## Quick commands

```bash
make dev              # next dev (host)
make build            # next build
make test             # vitest
make test-watch
make test-e2e         # playwright
make typecheck
make lint
make format
```

From the **repo root**, the orchestrator forwards: `make ui-dev`, `make ui-test`, `make ui-typecheck`, etc.

## Configuration

| Var | Default | Purpose |
|---|---|---|
| `HOLOCRON_API_URL` | `http://holocron:8000` | Server-side base URL the proxy routes use to reach the API |
| `NODE_ENV` | `development` | Standard Next.js |

## Conventions

- **Server components by default.** `'use client'` only when you need state, effects, or browser APIs.
- **Always go through the SDK.** Never call the Python API directly from a route handler. If the SDK lacks a method, add it there first (rebuild with `make sdk-build` from repo root), then consume it.
- **TDD.** Write the failing test first.
- **Strict types, no `any`.** Discriminated unions for state machines.
- **Galaxy theme is dark-only.** All colors are oklch tokens in `globals.css`.
- **New commands go through extensions.** Don't add ad-hoc buttons that duplicate ⌘K behaviour. See [docs/extensions.md](../../docs/extensions.md).

## Galaxy theme tokens

Defined in `src/app/globals.css` as oklch CSS variables. Highlights:

- Base: `--background`, `--foreground`, `--primary`, `--ring`, `--border`
- Asset types: `--asset-dataset`, `--asset-report`, `--asset-process`, `--asset-system`
- Actor types: `--actor-person`, `--actor-group`
- Rule severity: `--rule-info`, `--rule-warning`, `--rule-critical`
- Relation types: `--rel-owns`, `--rel-uses`, `--rel-feeds`, `--rel-contains`, `--rel-member-of`

Tailwind v4 picks them up automatically; the galaxy map maps them onto node and edge materials.
