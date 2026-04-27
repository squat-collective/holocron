# Holocron TypeScript SDK

> TypeScript/JavaScript client for the [Holocron](https://github.com/squat-collective/holocron) data governance API.

Part of the [Holocron monorepo](../../README.md). The OpenAPI source of truth this SDK is generated from lives at [`docs/openapi.json`](../../docs/openapi.json); the cross-cutting docs hub is at [`docs/`](../../docs/README.md).

## Features

- **Type-safe** - Full TypeScript support with types generated from OpenAPI spec
- **Dual API** - Plain objects or Active Record pattern with `.save()`, `.delete()`, `.refresh()`
- **Dirty tracking** - Only sends changed fields on update
- **Typed errors** - `NotFoundError`, `ValidationError`, `NetworkError`
- **Lazy loading** - Relations support `fetchFrom()` and `fetchTo()`
- **Lightweight** - Minimal dependencies, uses native fetch
- **Versioned** - Tracks Holocron API versions

## Installation

```bash
# Configure GitHub Packages
echo "@squat-collective:registry=https://npm.pkg.github.com" >> .npmrc

# Install
npm install @squat-collective/holocron-ts
# or
bun add @squat-collective/holocron-ts
```

See [Installation Guide](./docs/installation.md) for authentication setup.

## Quick Start

### Plain Object API

```typescript
import { HolocronClient } from '@squat-collective/holocron-ts';

const client = new HolocronClient({ baseUrl: 'http://localhost:8000' });

// Create an asset
const asset = await client.assets.create({
  type: 'dataset',
  name: 'Sales Data',
});

// Update
await client.assets.update(asset.uid, { description: 'Q4 sales' });

// Delete
await client.assets.delete(asset.uid);
```

### Active Record API

```typescript
// Create with entity class
const asset = client.models.assets.new({
  type: 'dataset',
  name: 'Sales Data',
});
await asset.save();

// Modify and save (only sends changed fields)
asset.description = 'Q4 sales data';
asset.status = 'active';
await asset.save(); // PATCH with only dirty fields

// Refresh from server
await asset.refresh();

// Delete
await asset.delete();
```

### Typed Error Handling

```typescript
import { HolocronClient, NotFoundError, ValidationError } from '@squat-collective/holocron-ts';

try {
  const asset = await client.assets.get('non-existent');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(`${error.resourceType} not found: ${error.resourceUid}`);
  } else if (error instanceof ValidationError) {
    console.log('Validation errors:', error.details);
  }
}
```

### Lazy Loading Relations

```typescript
// Get a relation
const relation = await client.models.relations.get(uid);

// Lazy load the connected entities
const owner = await relation.fetchFrom();  // Fetches and caches
const asset = await relation.fetchTo();

// Cached values available synchronously after fetch
console.log(relation.from?.name); // No network call
```

## API Compatibility

| SDK Version | API Version | Status |
|-------------|-------------|--------|
| 0.1.x       | v1          | Current |

## Resources

| Resource | Plain API | Active Record |
|----------|-----------|---------------|
| Assets | `client.assets.*` | `client.models.assets.*` |
| Actors | `client.actors.*` | `client.models.actors.*` |
| Relations | `client.relations.*` | `client.models.relations.*` |
| Events | `client.events.*` | - |

## Documentation

- [Installation Guide](./docs/installation.md)
- [Usage Examples](./docs/usage.md)
- [API Reference](./docs-dist/index.html) (TypeDoc generated)

## Development

```bash
# Install dependencies
bun install

# Run tests
make test

# Lint & typecheck
make check

# Generate docs
make docs
```

## License

MIT
