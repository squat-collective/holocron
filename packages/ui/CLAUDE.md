# Holocron Portal 🌌

> The Data Documentation Platform powered by Holocron

## 🎯 Purpose

A modern web application for exploring, documenting, and managing data assets. Think of it as a data catalog UI where users can:

- Browse and search data assets
- View data lineage and relationships
- Document assets with rich metadata
- Track actors (owners, stewards, consumers)
- Visualize data flows

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | **Next.js 15** (App Router) |
| Language | **TypeScript** (strict mode) |
| UI Components | **shadcn/ui** + Radix primitives |
| Styling | **Tailwind CSS** |
| Data Fetching | **TanStack Query v5** |
| API Client | **@squat-collective/holocron-ts** (workspace, lives at `packages/sdk-ts`) |
| Testing | **Vitest** + **React Testing Library** |
| E2E Testing | **Playwright** |
| Linting | **Biome** |
| Runtime | **Bun** |

## 📚 SDK Reference

This app uses the **holocron-ts** SDK. Never call the Holocron API directly.

The SDK is **in this monorepo** at `../sdk-ts/` (workspace dep `@squat-collective/holocron-ts`).
Read it directly instead of fetching docs from GitHub:

```bash
# Public exports
cat ../sdk-ts/src/index.ts

# Browse source
ls ../sdk-ts/src/

# README
cat ../sdk-ts/README.md
```

Always check the SDK before implementing to understand:
- Available methods and entities
- Error types and handling patterns
- Active Record vs Query API patterns

If the SDK is missing something, **add it there first** (TDD), rebuild
(`make build-sdk` from repo root), then consume it from the UI.

## 📏 Development Guidelines

### TDD - Test-Driven Development

**Always write tests first.** No exceptions.

1. **Red** — Write a failing test that defines expected behavior
2. **Green** — Write minimal code to make the test pass
3. **Refactor** — Clean up while keeping tests green

```bash
make test-watch   # Watch mode during development
make test         # Full suite before committing
```

### TypeScript - Strict Mode

- `strict: true` in tsconfig.json
- **No `any` types** — use `unknown` if truly unknown
- **No type assertions** (`as`) unless absolutely necessary
- Use **discriminated unions** for state

```typescript
// ✅ Good
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Asset[] }
  | { status: 'error'; error: Error };

// ❌ Bad
type State = { status: string; data?: any; error?: any };
```

### Error Handling

- Use **typed errors** from the SDK
- Handle errors at **boundaries** (page level, mutation callbacks)
- Show **user-friendly messages**, log technical details
- Use **Error Boundaries** for unexpected React errors

### Component Guidelines

- **Server Components by default** — only `'use client'` when needed
- **Colocation** — keep related files together
- **Single responsibility** — one component, one job
- **Composition over props** — prefer children/slots

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Dashboard layout group
│   │   ├── assets/
│   │   ├── actors/
│   │   └── lineage/
│   └── api/holocron/       # Proxy to Holocron API
├── components/
│   ├── ui/                 # shadcn/ui components
│   └── features/           # Feature components + tests
├── lib/
│   ├── holocron.ts         # Client singleton
│   └── utils.ts
├── hooks/                  # Custom hooks + tests
└── types/                  # App-specific types
```

## 🦭 Containerization (Podman)

All development in containers. Never install on host. Using **Podman** (rootless, daemonless).

```yaml
# docker-compose.yml (used with podman-compose)
services:
  dev:
    image: oven/bun:1
    working_dir: /app
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    ports:
      - "3000:3000"
    networks:
      - holocron
    environment:
      - HOLOCRON_API_URL=http://holocron:8000

networks:
  holocron:
    external: true

volumes:
  node_modules:
```

## 🔧 Makefile

```makefile
# Development
make dev          # Start dev server
make build        # Production build

# Testing
make test         # Run all tests
make test-watch   # Watch mode
make test-e2e     # Playwright E2E

# Code Quality
make lint         # Biome linter
make format       # Format code
make typecheck    # TypeScript check

# Utilities
make install      # Install deps
make shell        # Container shell
```

## 🔌 API Proxy

Browser can't reach internal network. Use Next.js API routes to proxy requests to Holocron.

## 🧪 Testing Strategy

| Type | Tool | Purpose |
|------|------|---------|
| Unit | Vitest | Hooks, utilities, components |
| Integration | RTL | User flows, API integration |
| E2E | Playwright | Critical journeys |

Mock the holocron client for isolated unit tests.

## ⚠️ Important Rules

1. **Never** call Holocron API directly — always use the SDK
2. **Always** check the in-tree SDK before implementing (`packages/sdk-ts/src/`)
3. **Always** write tests first (TDD)
4. **Never** use `any` types
5. **Always** run `make test` before commits
6. **Never** commit `.env` with secrets
7. **Prefer** server components for data fetching
