# Usage Guide

## Creating a Client

```typescript
import { HolocronClient } from '@squat-collective/holocron-ts';

const client = new HolocronClient({
  baseUrl: 'http://localhost:8000'
});
```

---

## Plain Object API

The plain object API returns simple JavaScript objects from API calls.

### Working with Assets

Assets represent data objects in your organization: datasets, reports, ETL processes, and systems.

#### Asset Types

| Type | Description |
|------|-------------|
| `dataset` | Tables, files, spreadsheets |
| `report` | Dashboards, reports, visualizations |
| `process` | ETL jobs, scripts, pipelines |
| `system` | Databases, applications, services |

#### Create an Asset

```typescript
const asset = await client.assets.create({
  type: 'dataset',
  name: 'Customer Data',
  description: 'Main customer database table',
  location: 'postgres://db/customers',
  status: 'active', // optional, defaults to 'active'
  metadata: {
    schema: 'public',
    table: 'customers'
  }
});

console.log(asset.uid); // Generated UUID
```

#### Get an Asset

```typescript
const asset = await client.assets.get('asset-uid-here');
console.log(asset.name);
```

#### List Assets

```typescript
// List all assets
const { items, total } = await client.assets.list();

// Filter by type
const datasets = await client.assets.list({ type: 'dataset' });

// Pagination
const page2 = await client.assets.list({ limit: 10, offset: 10 });
```

#### Update an Asset

```typescript
const updated = await client.assets.update('asset-uid', {
  name: 'New Name',
  status: 'deprecated'
});
```

#### Delete an Asset

```typescript
await client.assets.delete('asset-uid');
```

### Working with Actors

Actors represent people and groups in your organization.

#### Actor Types

| Type | Description |
|------|-------------|
| `person` | Individual user |
| `group` | Team, department, or group |

#### Create an Actor

```typescript
// Create a person
const person = await client.actors.create({
  type: 'person',
  name: 'Jane Doe',
  email: 'jane@example.com',
  description: 'Data Engineer'
});

// Create a group
const team = await client.actors.create({
  type: 'group',
  name: 'Data Platform Team',
  description: 'Responsible for data infrastructure'
});
```

#### List and Filter Actors

```typescript
// All actors
const { items } = await client.actors.list();

// Only people
const people = await client.actors.list({ type: 'person' });

// Only groups
const groups = await client.actors.list({ type: 'group' });
```

### Working with Relations

Relations define how assets and actors are connected.

#### Relation Types

| Type | Description | Example |
|------|-------------|---------|
| `owns` | Actor owns an asset | Person -> Dataset |
| `uses` | Actor uses an asset | Team -> Report |
| `feeds` | Asset feeds data to another | Dataset -> Dataset |
| `derived_from` | Asset derived from another | Report -> Dataset |
| `contains` | System contains assets | System -> Dataset |
| `produces` | Process produces an asset | Process -> Dataset |
| `consumes` | Process consumes an asset | Process -> Dataset |
| `member_of` | Person is member of group | Person -> Group |

#### Create a Relation

```typescript
// Person owns a dataset
const ownership = await client.relations.create({
  from: person.uid,
  to: dataset.uid,
  type: 'owns',
  properties: {
    since: '2024-01-01'
  }
});

// Data lineage: dataset A feeds dataset B
const lineage = await client.relations.create({
  from: datasetA.uid,
  to: datasetB.uid,
  type: 'feeds'
});
```

#### List Relations

```typescript
// All relations
const { items } = await client.relations.list();

// Filter by type
const ownership = await client.relations.list({ type: 'owns' });

// Filter by source
const fromActor = await client.relations.list({ from_uid: actor.uid });

// Filter by target
const toAsset = await client.relations.list({ to_uid: asset.uid });
```

#### Delete a Relation

```typescript
await client.relations.delete('relation-uid');
```

### Working with Events

Events provide an audit log of all changes in the system.

#### List Events

```typescript
// All events
const { items } = await client.events.list();

// Filter by entity
const assetEvents = await client.events.list({
  entity_type: 'asset',
  entity_uid: asset.uid
});

// Filter by action
const deletions = await client.events.list({ action: 'deleted' });
```

#### Get a Single Event

```typescript
const event = await client.events.get('event-uid');
console.log(event.action);    // 'created' | 'updated' | 'deleted'
console.log(event.timestamp); // ISO date string
console.log(event.changes);   // What changed
```

---

## Active Record API

The Active Record API provides entity classes with built-in persistence methods and dirty tracking.

### Why Use Active Record?

| Feature | Plain Object API | Active Record API |
|---------|------------------|-------------------|
| Create | `client.assets.create(data)` | `entity.save()` |
| Update | `client.assets.update(uid, data)` | `entity.save()` (auto-detects changes) |
| Delete | `client.assets.delete(uid)` | `entity.delete()` |
| Refresh | Manual re-fetch | `entity.refresh()` |
| Change tracking | Manual | Automatic dirty field detection |

### Working with Asset Entities

```typescript
// Create a new entity (not yet saved)
const asset = client.models.assets.new({
  type: 'dataset',
  name: 'Sales Data',
  description: 'Monthly sales figures'
});

console.log(asset.isNew);  // true
console.log(asset.isDirty); // false (no changes since creation)

// Save to server
await asset.save();
console.log(asset.uid);    // Now has server-assigned UID
console.log(asset.isNew);  // false
```

### Dirty Tracking

The Active Record API tracks which fields have changed and only sends those in updates:

```typescript
// Get an existing asset
const asset = await client.models.assets.get('asset-uid');

// Make changes
asset.name = 'Updated Name';
asset.description = 'New description';

console.log(asset.isDirty);     // true
console.log(asset.dirtyFields); // Set { 'name', 'description' }

// Save - only sends changed fields
await asset.save();

console.log(asset.isDirty);     // false
console.log(asset.dirtyFields); // Set {}
```

### Reverting Changes

```typescript
const asset = await client.models.assets.get('asset-uid');
const originalName = asset.name;

asset.name = 'Wrong Name';
console.log(asset.isDirty); // true

// Revert all changes
asset.revert();
console.log(asset.name);    // Back to original
console.log(asset.isDirty); // false
```

### Refreshing from Server

```typescript
const asset = await client.models.assets.get('asset-uid');

// Someone else updates the asset...

// Refresh to get latest data
await asset.refresh();
console.log(asset.updatedAt); // Now reflects server state
```

### Working with Actor Entities

```typescript
// Create
const actor = client.models.actors.new({
  type: 'person',
  name: 'Jane Doe',
  email: 'jane@example.com'
});
await actor.save();

// Update
actor.description = 'Senior Data Engineer';
await actor.save();

// Delete
await actor.delete();
```

### Working with Relation Entities

Relations support lazy loading of connected entities:

```typescript
// Create a relation
const relation = client.models.relations.new({
  from: actor,     // Can pass entity or UID string
  to: asset,
  type: 'owns',
  properties: { role: 'primary' }
});
await relation.save();

// Note: Relations cannot be updated, only created or deleted
```

#### Lazy Loading

```typescript
// Get a relation
const relation = await client.models.relations.get('relation-uid');

// UIDs are always available
console.log(relation.fromUid); // 'actor-uid'
console.log(relation.toUid);   // 'asset-uid'

// Entities must be fetched
console.log(relation.from); // undefined (not yet loaded)

// Fetch the 'from' entity
const owner = await relation.fetchFrom();
console.log(owner.name); // 'Jane Doe'

// Now cached
console.log(relation.from); // ActorEntity
console.log(relation.from === owner); // true (same reference)

// Subsequent calls return cached value
const ownerAgain = await relation.fetchFrom(); // No network call
```

### Listing Entities

```typescript
// List all assets
const { items, total } = await client.models.assets.list();
items.forEach(asset => {
  console.log(asset.name);
  asset.status = 'reviewed';
});

// Save all modified entities
await Promise.all(items.filter(a => a.isDirty).map(a => a.save()));

// Filter and paginate
const datasets = await client.models.assets.list({
  type: 'dataset',
  limit: 10,
  offset: 20
});
```

### Metadata Mutation Warning

Direct mutations to metadata objects are **not tracked**:

```typescript
// This will NOT trigger dirty tracking
asset.metadata.key = 'value';
console.log(asset.isDirty); // false - change not detected!

// Instead, reassign the entire object
asset.metadata = { ...asset.metadata, key: 'value' };
console.log(asset.isDirty); // true - change detected
```

---

## Error Handling

The SDK provides typed error classes for precise error handling:

### Error Types

| Error Class | HTTP Status | Description |
|-------------|-------------|-------------|
| `HolocronError` | Any | Base class for all API errors |
| `NotFoundError` | 404 | Resource not found |
| `ValidationError` | 422 | Request validation failed |
| `NetworkError` | - | Network/connectivity issues |

### Basic Error Handling

```typescript
import {
  HolocronClient,
  NotFoundError,
  ValidationError,
  NetworkError,
  HolocronError
} from '@squat-collective/holocron-ts';

try {
  const asset = await client.assets.get('non-existent-uid');
} catch (error) {
  if (error instanceof NotFoundError) {
    // 404 - Resource not found
    console.log(`${error.resourceType} not found: ${error.resourceUid}`);
    console.log(error.statusCode); // 404
  } else if (error instanceof ValidationError) {
    // 422 - Validation failed
    console.log('Validation errors:');
    error.details?.forEach(d => {
      console.log(`  ${d.loc.join('.')}: ${d.msg}`);
    });
  } else if (error instanceof NetworkError) {
    // Network issue (timeout, connection refused, etc.)
    console.log('Network error:', error.message);
  } else if (error instanceof HolocronError) {
    // Other API error
    console.log(`API error (${error.statusCode}): ${error.message}`);
  }
}
```

### Error Properties

All errors include rich context:

```typescript
try {
  await client.assets.get('bad-uid');
} catch (error) {
  if (error instanceof HolocronError) {
    console.log(error.message);     // Human-readable message
    console.log(error.statusCode);  // HTTP status code
    console.log(error.operation);   // 'get asset', 'list actors', etc.
    console.log(error.apiError);    // Raw error from API
  }

  if (error instanceof NotFoundError) {
    console.log(error.resourceType); // 'asset', 'actor', 'relation'
    console.log(error.resourceUid);  // The UID that wasn't found
  }
}
```

---

## TypeScript Types

The SDK exports all types for use in your code:

```typescript
import type {
  // Data types
  Asset,
  AssetCreate,
  AssetUpdate,
  AssetType,
  AssetStatus,
  Actor,
  ActorCreate,
  ActorType,
  Relation,
  RelationType,
  Event,
  EventAction,
  EntityType,

  // Entity classes
  AssetEntity,
  ActorEntity,
  RelationEntity,

  // Error classes
  HolocronError,
  NotFoundError,
  ValidationError,
  NetworkError,
} from '@squat-collective/holocron-ts';

// Use in your functions
function processAsset(asset: Asset | AssetEntity) {
  console.log(asset.name);
}

// Type-safe creation
const input: AssetCreate = {
  type: 'dataset',
  name: 'My Dataset'
};
```
