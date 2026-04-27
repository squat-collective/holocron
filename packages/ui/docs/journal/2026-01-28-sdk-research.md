# 2026-01-28: holocron-ts SDK Deep Dive 🔬

## Summary

Comprehensive research into the `@squat-collective/holocron-ts` SDK - understanding its API, patterns, and capabilities.

## SDK Overview

| Property | Value |
|----------|-------|
| Package | `@squat-collective/holocron-ts` |
| Version | v0.1.0 |
| Released | 2026-01-27 |
| Registry | GitHub Packages |
| API Version | v1 |

## Installation

```bash
# Configure GitHub Packages auth
echo "@squat-collective:registry=https://npm.pkg.github.com" >> .npmrc

# Install
bun add @squat-collective/holocron-ts
```

## Architecture

### Dual API Pattern

The SDK offers two ways to interact with data:

#### 1. Plain Object API
```typescript
const client = new HolocronClient({ baseUrl: 'http://localhost:8000' });

// CRUD operations return plain objects
const asset = await client.assets.create({ type: 'dataset', name: 'Sales' });
await client.assets.update(asset.uid, { description: 'Updated' });
await client.assets.delete(asset.uid);
```

#### 2. Active Record API
```typescript
// Entities with .save(), .delete(), .refresh() methods
const asset = client.models.assets.new({ type: 'dataset', name: 'Sales' });
await asset.save();

asset.description = 'Updated';  // Tracked!
await asset.save();  // Only sends changed fields (PATCH behavior)
```

### Key Features

- **Dirty Tracking** - Only sends changed fields on update
- **Lazy Loading** - Relations can fetch connected entities with `fetchFrom()`, `fetchTo()`
- **Typed Errors** - `NotFoundError`, `ValidationError`, `NetworkError`
- **Type Safety** - Generated from OpenAPI spec

## Domain Model

### Core Entities

```
┌─────────────┐         ┌─────────────┐
│   ACTOR     │         │   ASSET     │
├─────────────┤         ├─────────────┤
│ type:       │         │ type:       │
│  - person   │◄───────►│  - dataset  │
│  - group    │ RELATION│  - report   │
│             │         │  - process  │
│ name        │         │  - system   │
│ email?      │         │             │
│ metadata    │         │ name        │
└─────────────┘         │ description │
                        │ location    │
                        │ status      │
                        │ metadata    │
                        └─────────────┘
```

### Relation Types

| Type | Description | Example |
|------|-------------|---------|
| `owns` | Ownership | Actor owns Asset |
| `uses` | Usage | Actor uses Asset |
| `feeds` | Data flow | Asset feeds Asset |
| `derived_from` | Lineage | Asset derived from Asset |
| `contains` | Hierarchy | Asset contains Asset |
| `produces` | Output | Process produces Dataset |
| `consumes` | Input | Process consumes Dataset |
| `member_of` | Group membership | Person member_of Group |

### Asset Types

| Type | Description |
|------|-------------|
| `dataset` | Data tables, files, etc. |
| `report` | Dashboards, visualizations |
| `process` | ETL jobs, pipelines |
| `system` | Applications, databases |

### Asset Status

| Status | Description |
|--------|-------------|
| `active` | Currently in use |
| `deprecated` | Being phased out |
| `draft` | Not yet published |

### Actor Types

| Type | Description |
|------|-------------|
| `person` | Individual user |
| `group` | Team, department |

## Error Handling

```typescript
import { NotFoundError, ValidationError, NetworkError } from '@squat-collective/holocron-ts';

try {
  await client.assets.get('non-existent');
} catch (error) {
  if (error instanceof NotFoundError) {
    // error.resourceType, error.resourceUid
  } else if (error instanceof ValidationError) {
    // error.details (array of validation errors)
  } else if (error instanceof NetworkError) {
    // Network connectivity issues
  }
}
```

### Error Properties

| Error | Status | Properties |
|-------|--------|------------|
| `NotFoundError` | 404 | `resourceType`, `resourceUid` |
| `ValidationError` | 422 | `details` (loc, msg, type) |
| `NetworkError` | - | `cause` |
| `HolocronError` | any | `statusCode`, `apiError`, `operation` |

## API Endpoints

| Resource | Endpoints |
|----------|-----------|
| Health | `GET /api/v1/health` |
| Assets | `GET/POST /api/v1/assets`, `GET/PUT/DELETE /api/v1/assets/{uid}` |
| Actors | `GET/POST /api/v1/actors`, `GET/PUT/DELETE /api/v1/actors/{uid}` |
| Relations | `GET/POST /api/v1/relations`, `DELETE /api/v1/relations/{uid}` |
| Events | `GET /api/v1/events`, `GET /api/v1/events/{uid}` |

Note: Relations don't have an update endpoint - delete and recreate instead.

## Pagination

All list endpoints support:
- `limit` - Max items (default: 50, max: 100)
- `offset` - Skip N items

Returns: `{ items: T[], total: number }`

## Key Insights for Portal Development

### 1. Use Active Record for Forms
The dirty tracking is perfect for edit forms - only changed fields are sent.

### 2. Lazy Loading for Lineage
Relations support lazy loading which is ideal for lineage visualization - load connected entities on demand.

### 3. Typed Errors for UX
Map SDK errors to user-friendly messages at boundaries.

### 4. Server Components + SDK
Use the SDK in Server Components, pass serialized data to client.

### 5. API Proxy Required
Browser can't reach internal network - use Next.js API routes to proxy.

## Action Items

- [ ] Create ADR for SDK usage patterns (Active Record vs Plain)
- [ ] Design API proxy strategy (Next.js API routes)
- [ ] Plan TanStack Query integration with SDK
- [ ] Define error boundary strategy

## References

- [SDK Repository](https://github.com/squat-collective/holocron-ts)
- [Release v0.1.0](https://github.com/squat-collective/holocron-ts/releases/tag/v0.1.0)

## Tags

`#research` `#sdk` `#architecture`
