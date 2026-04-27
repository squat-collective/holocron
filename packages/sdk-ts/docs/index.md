# Holocron TypeScript SDK

> TypeScript/JavaScript client for the [Holocron](https://github.com/squat-collective/holocron) data governance API.

## Features

- **Type-safe** - Full TypeScript support with types generated from OpenAPI spec
- **Dual API** - Plain objects or Active Record pattern with `.save()`, `.delete()`, `.refresh()`
- **Dirty tracking** - Only sends changed fields on update
- **Typed errors** - `NotFoundError`, `ValidationError`, `NetworkError`
- **Lazy loading** - Relations support `fetchFrom()` and `fetchTo()`
- **Lightweight** - Minimal dependencies, uses native fetch
- **Versioned** - Tracks Holocron API versions

## API Compatibility

| SDK Version | API Version | Status |
|-------------|-------------|--------|
| 0.1.x       | v1          | Current |

## Quick Start

### Installation

```bash
# Configure GitHub Packages (see Installation guide)
echo "@squat-collective:registry=https://npm.pkg.github.com" >> .npmrc

# Install
bun add @squat-collective/holocron-ts
```

### Plain Object API

```typescript
import { HolocronClient } from '@squat-collective/holocron-ts';

const client = new HolocronClient({ baseUrl: 'http://localhost:8000' });

// Create an asset
const asset = await client.assets.create({
  type: 'dataset',
  name: 'Sales Data Q4',
});

console.log(asset.uid); // 'abc-123-def'
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
asset.description = 'Quarterly sales data';
await asset.save();

// Refresh from server
await asset.refresh();

// Delete
await asset.delete();
```

### Check API Version Support

```typescript
import { HolocronClient, SUPPORTED_API_VERSIONS } from '@squat-collective/holocron-ts';

// Check supported versions
console.log(SUPPORTED_API_VERSIONS); // ['v1']

// Check if a specific version is supported
if (HolocronClient.supportsApiVersion('v1')) {
  const client = new HolocronClient({
    baseUrl: 'http://localhost:8000',
    apiVersion: 'v1'
  });
}
```

## Resources

The client provides access to these resources via two APIs:

| Resource | Plain API | Active Record | Description |
|----------|-----------|---------------|-------------|
| Assets | `client.assets` | `client.models.assets` | Data assets (datasets, reports, processes, systems) |
| Actors | `client.actors` | `client.models.actors` | People and groups |
| Relations | `client.relations` | `client.models.relations` | Relationships between entities |
| Events | `client.events` | - | Audit log of changes |

## Documentation

- [Installation Guide](./installation.md)
- [Usage Examples](./usage.md)
- [API Reference](#api-reference) (below)

## License

MIT
