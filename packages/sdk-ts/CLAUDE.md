# Holocron TypeScript SDK 📦

> TypeScript/JavaScript client for the Holocron API

## 🎯 Purpose

Provide a typed, ergonomic SDK for interacting with the Holocron REST API from Node.js and browser environments.

## 📁 Structure

```
holocron-ts/
├── src/
│   ├── client.ts        # Main HolocronClient class
│   ├── types.ts         # TypeScript types (from OpenAPI)
│   ├── resources/       # API resource classes
│   │   ├── assets.ts
│   │   ├── actors.ts
│   │   ├── relations.ts
│   │   └── events.ts
│   └── index.ts         # Public exports
├── tests/
├── package.json
├── tsconfig.json
└── docker-compose.yml   # Dev environment (joins holocron network)
```

## 📏 Guidelines

### Development
- **TDD** — Write tests first, then implement. No code without tests.
- **KISS** — Keep it simple. Build only what's needed. Simple > clever.
- **Containerized** — Dev environment runs in Docker, joins `holocron` network
- **TypeScript strict** — Enable strict mode, no `any` types
- **Test against real API** — Integration tests hit the actual Holocron API

### TDD Workflow
1. **Write failing test** — Define expected behavior first
2. **Implement minimum code** — Just enough to pass the test
3. **Refactor** — Clean up while keeping tests green
4. **Repeat** — Next feature starts with a test

### API Contract
- **OpenAPI source** — Types derived from `http://holocron:8000/openapi.json`
- **Version compatibility** — SDK version should track API version

### Tooling
- **Bun** — Package manager, runtime, test runner (`bun test`), and bundler (`bun build`)
- **Biome** — Linting and formatting

### Code Style
- **Async/await** — All API methods return Promises
- **Error handling** — Throw typed errors for API failures
- **No dependencies** — Use native fetch, minimal deps

## 🔗 Holocron Network

Connect to API during development:

```yaml
# docker-compose.yml
services:
  dev:
    image: oven/bun:1
    networks:
      - holocron
    environment:
      - HOLOCRON_URL=http://holocron:8000

networks:
  holocron:
    external: true
```

## 📖 Usage Example

```typescript
import { HolocronClient } from 'holocron-ts';

const client = new HolocronClient('http://localhost:8000');

// Create an asset
const asset = await client.assets.create({
  type: 'dataset',
  name: 'Sales Data',
});

// List events for the asset
const events = await client.events.list({
  entity_uid: asset.uid,
});
```

## 🚀 Publishing

- Package name: `@holocron/sdk` or `holocron-ts`
- Registry: npm
- Versioning: Semver, track API compatibility
