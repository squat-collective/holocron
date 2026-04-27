# ADR-0001: Technology Stack Selection

**Status**: Accepted
**Date**: 2026-01-28
**Deciders**: Tom

---

## Context

We are building Holocron Portal, a data documentation platform. We need to select technologies for:
- Frontend framework
- Language
- UI components
- Data fetching
- Testing
- Linting/formatting
- Runtime

### Requirements

1. **Developer Experience** — Fast iteration, good tooling
2. **Performance** — Fast initial load, smooth interactions
3. **Type Safety** — Catch errors at compile time
4. **Maintainability** — Clear patterns, easy to onboard
5. **Modern** — Not accumulating tech debt from day one
6. **Docker-first** — Everything containerized

---

## Decision

We will use the following technology stack:

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js | 15.x |
| Language | TypeScript | 5.x (strict) |
| UI Components | shadcn/ui + Radix | Latest |
| Styling | Tailwind CSS | 4.x |
| Data Fetching | TanStack Query | 5.x |
| API Client | holocron-ts SDK | 0.1.x |
| Unit Testing | Vitest + RTL | Latest |
| E2E Testing | Playwright | Latest |
| Linting | Biome | Latest |
| Runtime | Bun | 1.x |

---

## Rationale

### Next.js 15 (App Router)

**Chosen over**: Remix, Astro, Vite SPA

| Pro | Con |
|-----|-----|
| Server Components for performance | Learning curve for App Router |
| Excellent SSR/SSG support | Vercel-centric ecosystem |
| Built-in API routes (perfect for proxy) | |
| Huge ecosystem & community | |
| App Router is the future | |

**Why not alternatives?**
- **Remix**: Great, but smaller ecosystem, less hiring pool
- **Astro**: Better for content sites, less for apps
- **Vite SPA**: Loses SSR benefits, SEO concerns

### TypeScript (Strict Mode)

**Chosen over**: JavaScript, Flow

| Pro | Con |
|-----|-----|
| Catch errors before runtime | Build step overhead |
| Excellent IDE support | Learning curve for strict mode |
| Self-documenting code | |
| SDK provides full types | |

**Strict mode rationale**: With `strict: true`, we get:
- No implicit `any`
- Strict null checks
- Strict function types
- No `any` types allowed

This catches more bugs and makes the codebase more maintainable.

### shadcn/ui + Radix

**Chosen over**: Material UI, Chakra UI, Ant Design

| Pro | Con |
|-----|-----|
| Copy/paste components (full control) | Manual installation per component |
| Built on Radix (accessible) | Less "batteries included" |
| Tailwind-native | |
| Beautiful defaults | |
| No runtime dependency bloat | |

**Why not alternatives?**
- **MUI/Chakra/Ant**: Heavy runtime, opinionated styling, harder to customize
- **Headless UI**: Less components, more work
- **shadcn/ui** gives us the best of both worlds

### Tailwind CSS

**Chosen over**: CSS Modules, Styled Components, vanilla CSS

| Pro | Con |
|-----|-----|
| Rapid development | Verbose class names |
| Consistent design system | Learning utility classes |
| No CSS file switching | |
| Great with shadcn/ui | |
| Built-in dark mode | |

### TanStack Query v5

**Chosen over**: SWR, RTK Query, vanilla fetch

| Pro | Con |
|-----|-----|
| Excellent caching & invalidation | Learning curve |
| Background refetching | Another library to maintain |
| Devtools | |
| Mutations with cache updates | |
| Works great with SSR | |

**Why not alternatives?**
- **SWR**: Simpler but less features (mutations, devtools)
- **RTK Query**: Requires Redux, overkill for our needs
- **Vanilla fetch**: No caching, manual everything

### holocron-ts SDK

**Mandatory** — This is our API client. Key benefits:
- Full TypeScript types
- Active Record pattern for mutations
- Typed errors for handling
- Never call API directly

### Vitest + React Testing Library

**Chosen over**: Jest, Cypress component testing

| Pro | Con |
|-----|-----|
| Fast (Vite-powered) | Newer than Jest |
| Jest-compatible API | |
| Native ESM support | |
| Great with TypeScript | |

**RTL rationale**: Test behavior, not implementation. Query by accessibility roles, not test IDs.

### Playwright

**Chosen over**: Cypress, Puppeteer

| Pro | Con |
|-----|-----|
| Multi-browser (Chrome, Firefox, Safari) | Less mature than Cypress |
| Faster execution | |
| Better for CI | |
| Auto-wait, no flaky tests | |

### Biome

**Chosen over**: ESLint + Prettier

| Pro | Con |
|-----|-----|
| Single tool (lint + format) | Newer, less plugins |
| 10-100x faster than ESLint | |
| Batteries included | |
| Zero config to start | |

**Why not ESLint + Prettier?**
- Two tools to configure
- Slow on large codebases
- Biome does both, faster

### Bun

**Chosen over**: Node.js, Deno

| Pro | Con |
|-----|-----|
| Fast package manager | Newer runtime |
| Fast runtime | Less battle-tested |
| TypeScript native | Some edge cases |
| Drop-in Node replacement | |

**Why not alternatives?**
- **Node.js**: Slower package installs, needs separate TS setup
- **Deno**: Different module system, less ecosystem compatibility

---

## Consequences

### Positive

1. **Fast development** — Modern tooling, great DX
2. **Type safety** — Fewer runtime errors
3. **Performance** — SSR + caching + fast runtime
4. **Maintainable** — Clear patterns, strict typing
5. **Future-proof** — Modern stack, actively maintained

### Negative

1. **Learning curve** — App Router, TanStack Query, Biome
2. **Bleeding edge** — Some tools are newer (Bun, Biome)
3. **Lock-in** — Committed to React ecosystem

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Bun compatibility issues | Can fall back to Node.js |
| Biome missing rule | Can add ESLint for specific rule |
| Next.js 15 bugs | Pin to stable version |

---

## Alternatives Considered

### Full comparison matrix

| Criteria | Our Stack | Alternative A | Alternative B |
|----------|-----------|---------------|---------------|
| **Framework** | Next.js 15 | Remix | Vite + React |
| **Styling** | Tailwind | CSS Modules | Styled Components |
| **Data** | TanStack Query | SWR | RTK Query |
| **Testing** | Vitest | Jest | Cypress |
| **Linting** | Biome | ESLint + Prettier | Rome |

Our stack optimizes for **developer experience** and **performance** while maintaining **type safety** and **maintainability**.

---

## References

- [Next.js 15 Release](https://nextjs.org/blog/next-15)
- [shadcn/ui](https://ui.shadcn.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Biome](https://biomejs.dev/)
- [Bun](https://bun.sh/)
