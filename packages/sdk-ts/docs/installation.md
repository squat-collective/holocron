# Installation

## Requirements

- Node.js 18+ or Bun 1.0+
- A running Holocron API instance

## Install from GitHub Packages

The package is published to GitHub Packages under `@squat-collective/holocron-ts`.

### 1. Configure Registry

Create or update `.npmrc` in your project root:

```bash
@squat-collective:registry=https://npm.pkg.github.com
```

### 2. Authenticate with GitHub

You need a GitHub Personal Access Token (PAT) with `read:packages` scope.

```bash
# Login to GitHub Packages
npm login --registry=https://npm.pkg.github.com
# Username: YOUR_GITHUB_USERNAME
# Password: YOUR_GITHUB_TOKEN
# Email: your@email.com
```

Or set the token in `.npmrc`:

```bash
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
@squat-collective:registry=https://npm.pkg.github.com
```

### 3. Install the Package

#### npm

```bash
npm install @squat-collective/holocron-ts
```

#### Bun

```bash
bun add @squat-collective/holocron-ts
```

#### pnpm

```bash
pnpm add @squat-collective/holocron-ts
```

#### Yarn

```bash
yarn add @squat-collective/holocron-ts
```

## TypeScript Configuration

The SDK is written in TypeScript and includes type definitions. No additional `@types` packages are needed.

For best results, ensure your `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

## Verify Installation

```typescript
import { HolocronClient } from '@squat-collective/holocron-ts';

const client = new HolocronClient({
  baseUrl: 'http://localhost:8000'
});

// Test connection
const health = await client.health();
console.log('Connected:', health.status === 'healthy');
```

## Environment Variables

You can configure the client URL via environment variables:

```typescript
const client = new HolocronClient({
  baseUrl: process.env.HOLOCRON_URL || 'http://localhost:8000'
});
```

Common environment variable names:

| Variable | Description | Default |
|----------|-------------|---------|
| `HOLOCRON_URL` | Base URL of the Holocron API | `http://localhost:8000` |
