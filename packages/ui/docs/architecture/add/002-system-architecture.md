# ADD-002: System Architecture 🏗️

> Architecture Design Document

**Status**: Draft
**Created**: 2026-01-28
**Author**: Tom & Claude

---

## 1. Overview

This document describes the technical architecture of Holocron Portal — how components are organized, how data flows, and how the system integrates with the Holocron API.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Next.js App                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Server    │  │   Client    │  │   TanStack      │   │  │
│  │  │ Components  │  │ Components  │  │   Query Cache   │   │  │
│  │  │   (SSR)     │  │ (Interactive│  │                 │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │  │
│  │         │                │                   │            │  │
│  └─────────┼────────────────┼───────────────────┼────────────┘  │
│            │                │                   │               │
└────────────┼────────────────┼───────────────────┼───────────────┘
             │                │                   │
             │                └───────────────────┘
             │                          │
             ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Server                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   API Routes                               │  │
│  │                 /api/holocron/*                            │  │
│  │              (Proxy to Holocron)                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 holocron-ts SDK                            │  │
│  │              (Server-side client)                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Holocron API                                 │
│                  (Internal Network)                              │
│               http://holocron:8000/api/v1                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Fetching** | Server Components + TanStack Query | SSR for initial load (SEO, fast), Query for client interactions |
| **Search** | Hybrid (server + client cache) | Server-side search via API, client debounce & cache results |
| **State Management** | TanStack Query only | Server state via Query, minimal client state needed |
| **API Access** | Proxy through Next.js | Browser can't reach internal network directly |
| **Styling** | Tailwind + shadcn/ui | Rapid development, consistent design system |

---

## 4. Data Flow Patterns

### Pattern 1: Initial Page Load (SSR)

```
1. User navigates to /assets/abc123
2. Next.js Server Component fetches data
   → SDK: client.assets.get('abc123')
   → Holocron API: GET /api/v1/assets/abc123
3. Server renders HTML with data
4. HTML sent to browser (fast first paint)
5. Client hydrates, TanStack Query initializes cache
```

**Benefits**: Fast initial load, SEO-friendly, no loading spinners

### Pattern 2: Client Navigation (SPA)

```
1. User clicks asset link (client-side nav)
2. TanStack Query checks cache
   → HIT: Render immediately
   → MISS: Fetch via API proxy
3. API Route proxies to Holocron
4. Data cached for future use
```

**Benefits**: Instant navigation when cached, smooth UX

### Pattern 3: Search (Hybrid)

```
1. User types in search box
2. Client debounces input (300ms)
3. TanStack Query fetches search results
   → POST /api/holocron/search
4. Results cached by query string
5. Subsequent same-query is instant
```

**Benefits**: No excessive API calls, fast repeat searches

### Pattern 4: Mutations (Create/Update)

```
1. User edits asset (form)
2. Client Component calls mutation
   → useMutation → POST /api/holocron/assets
3. On success:
   → Invalidate related queries
   → Show success toast
4. On error:
   → Show error message (typed from SDK)
```

**Benefits**: Optimistic UI possible, proper cache invalidation

---

## 5. Component Architecture

### Rendering Strategy

| Component Type | When to Use |
|----------------|-------------|
| **Server Component** | Data display, no interactivity needed |
| **Client Component** | Forms, search, any user interaction |
| **Hybrid** | Server fetches initial, client handles updates |

### Component Hierarchy

```
app/
├── layout.tsx              ← Root layout (Providers)
├── page.tsx                ← Home/Search page
│
├── (dashboard)/            ← Dashboard layout group
│   ├── layout.tsx          ← Sidebar, nav
│   │
│   ├── assets/
│   │   ├── page.tsx        ← Asset list (Server)
│   │   └── [uid]/
│   │       └── page.tsx    ← Asset detail (Server)
│   │
│   ├── actors/
│   │   ├── page.tsx        ← Actor list (Server)
│   │   └── [uid]/
│   │       └── page.tsx    ← Actor detail (Server)
│   │
│   └── search/
│       └── page.tsx        ← Search results (Hybrid)
│
└── api/
    └── holocron/
        └── [...path]/
            └── route.ts    ← API proxy (catch-all)
```

---

## 6. API Proxy Design

### Why Proxy?

The browser runs in user's network but Holocron API is on internal infrastructure. Next.js API routes bridge this gap.

### Implementation

```typescript
// app/api/holocron/[...path]/route.ts

import { HolocronClient } from '@squat-collective/holocron-ts';

const client = new HolocronClient({
  baseUrl: process.env.HOLOCRON_API_URL, // http://holocron:8000
});

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');

  // Route to appropriate SDK method
  // /api/holocron/assets → client.assets.list()
  // /api/holocron/assets/abc → client.assets.get('abc')
}
```

### API Routes

| Portal Route | Holocron SDK Method |
|--------------|---------------------|
| `GET /api/holocron/assets` | `client.assets.list()` |
| `GET /api/holocron/assets/:uid` | `client.assets.get(uid)` |
| `POST /api/holocron/assets` | `client.assets.create(body)` |
| `PUT /api/holocron/assets/:uid` | `client.assets.update(uid, body)` |
| `DELETE /api/holocron/assets/:uid` | `client.assets.delete(uid)` |
| `GET /api/holocron/actors` | `client.actors.list()` |
| `GET /api/holocron/actors/:uid` | `client.actors.get(uid)` |
| `GET /api/holocron/relations` | `client.relations.list()` |
| `GET /api/holocron/search?q=...` | `client.assets.list({ search: q })` |

---

## 7. TanStack Query Setup

### Query Keys Convention

```typescript
// Hierarchical query keys for easy invalidation
const queryKeys = {
  assets: {
    all: ['assets'] as const,
    lists: () => [...queryKeys.assets.all, 'list'] as const,
    list: (filters: AssetFilters) => [...queryKeys.assets.lists(), filters] as const,
    details: () => [...queryKeys.assets.all, 'detail'] as const,
    detail: (uid: string) => [...queryKeys.assets.details(), uid] as const,
  },
  actors: {
    all: ['actors'] as const,
    // ... same pattern
  },
  search: {
    all: ['search'] as const,
    results: (query: string) => [...queryKeys.search.all, query] as const,
  },
};
```

### Custom Hooks

```typescript
// hooks/use-asset.ts
export function useAsset(uid: string) {
  return useQuery({
    queryKey: queryKeys.assets.detail(uid),
    queryFn: () => fetch(`/api/holocron/assets/${uid}`).then(r => r.json()),
  });
}

// hooks/use-search.ts
export function useSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.search.results(query),
    queryFn: () => fetch(`/api/holocron/search?q=${query}`).then(r => r.json()),
    enabled: query.length > 0,
    staleTime: 1000 * 60, // Cache for 1 minute
  });
}
```

---

## 8. Project Structure

```
holocron-portal/
├── docs/                        # Documentation (you are here!)
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout + providers
│   │   ├── page.tsx             # Home page
│   │   ├── (dashboard)/         # Dashboard route group
│   │   │   ├── layout.tsx       # Dashboard layout (sidebar)
│   │   │   ├── assets/          # Asset pages
│   │   │   ├── actors/          # Actor pages
│   │   │   └── search/          # Search page
│   │   └── api/
│   │       └── holocron/        # API proxy routes
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   ├── layout/              # Layout components
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── search-bar.tsx
│   │   └── features/            # Feature components
│   │       ├── assets/
│   │       │   ├── asset-card.tsx
│   │       │   ├── asset-card.test.tsx
│   │       │   ├── asset-detail.tsx
│   │       │   └── asset-list.tsx
│   │       ├── actors/
│   │       │   └── ...
│   │       ├── search/
│   │       │   ├── search-results.tsx
│   │       │   └── search-input.tsx
│   │       └── lineage/
│   │           └── lineage-list.tsx
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── use-asset.ts
│   │   ├── use-asset.test.ts
│   │   ├── use-actors.ts
│   │   ├── use-search.ts
│   │   └── use-debounce.ts
│   │
│   ├── lib/                     # Utilities and config
│   │   ├── holocron.ts          # SDK client singleton
│   │   ├── query-client.ts      # TanStack Query config
│   │   ├── query-keys.ts        # Query key factory
│   │   └── utils.ts             # General utilities
│   │
│   └── types/                   # App-specific types
│       └── index.ts
│
├── public/                      # Static assets
│
├── tests/
│   ├── e2e/                     # Playwright tests
│   └── setup.ts                 # Test setup
│
├── docker-compose.yml           # Container config
├── Dockerfile                   # Production image
├── Makefile                     # Developer commands
├── biome.json                   # Linter config
├── tailwind.config.ts           # Tailwind config
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Test config
└── package.json
```

---

## 9. Error Handling Strategy

### Error Boundaries

```
app/
├── error.tsx              ← Global error boundary
├── (dashboard)/
│   ├── error.tsx          ← Dashboard-level errors
│   └── assets/
│       └── [uid]/
│           └── error.tsx  ← Asset detail errors
```

### Error Mapping

```typescript
// Map SDK errors to user messages
function getErrorMessage(error: unknown): string {
  if (error instanceof NotFoundError) {
    return "This item doesn't exist or was deleted.";
  }
  if (error instanceof ValidationError) {
    return "Please check your input and try again.";
  }
  if (error instanceof NetworkError) {
    return "Connection failed. Please check your network.";
  }
  return "Something went wrong. Please try again.";
}
```

### Error Display

- **Toast** for transient errors (network, validation)
- **Error page** for fatal errors (404, 500)
- **Inline** for form validation

---

## 10. Performance Considerations

### Caching Strategy

| Data | Cache Time | Rationale |
|------|------------|-----------|
| Asset list | 30 seconds | May change frequently |
| Asset detail | 5 minutes | Less volatile |
| Actor list | 5 minutes | Rarely changes |
| Search results | 1 minute | Balance freshness/performance |

### Optimizations

1. **Prefetching** - Prefetch asset on hover
2. **Pagination** - Load assets in pages (50/page)
3. **Debouncing** - Search input debounced 300ms
4. **Code splitting** - Feature components lazy loaded

---

## 11. Security Considerations

### MVP (No Auth)
- All data is readable
- Edit operations still available (no permission check)
- Trust internal network security

### Future (With Auth)
- JWT tokens from SSO
- API routes validate token
- Role-based UI (hide edit buttons)

---

## 12. Open Questions

- [ ] Should we implement optimistic updates for edits?
- [ ] How to handle stale data notifications?
- [ ] Polling vs. WebSockets for real-time updates (future)?
- [ ] How to cache search suggestions/autocomplete?

---

## References

- [ADD-001: Product Vision](./001-product-vision.md)
- [Journal: SDK Research](../../journal/2026-01-28-sdk-research.md)
- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [TanStack Query Docs](https://tanstack.com/query/latest)
