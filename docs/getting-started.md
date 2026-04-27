# Getting started

> Bring up the stack, create your first asset, import a CSV, run an audit, and see results in the UI — in about 10 minutes.

## Prerequisites

- **Podman** or **Docker** with `compose` support.
- That's it. Nothing else needs to be installed on the host.

## 1. Start the stack

There are two paths depending on what you're doing.

### a) Run Holocron (one-click install)

```bash
curl -fsSL https://github.com/squat-collective/holocron/releases/latest/download/install.sh | bash
```

Pulls pre-built images from GHCR, generates a strong Neo4j password into `./holocron/.env`, brings everything up, and waits until `/health` is green. This is the recommended path for users.

To pin a release: `… | HOLOCRON_VERSION=v0.1.0 bash`. To upgrade later: `… | bash -s -- --update` (see [Upgrading](deployment.md#upgrading-to-a-new-release)). To put it on the open internet, see the [Caddy overlay](deployment.md#2-caddy-overlay-public-facing).

### b) Develop on Holocron (build from source)

```bash
git clone https://github.com/squat-collective/holocron.git && cd holocron
make up         # builds the API locally with dev extras, runs UI as `bun dev`
make health
```

The dev compose mounts source for live reload and includes pytest/mypy/ruff in the API container. Use this only if you're hacking on Holocron itself.

### Endpoints (both paths)

| Service | URL | Credentials |
|---|---|---|
| UI | <http://localhost:3333> | none |
| API | <http://localhost:8100> | none |
| Neo4j Browser | <http://localhost:7474> | `neo4j` / one-click: in `.env` · dev: `holocron` |

The first start is slow — Neo4j needs ~30 s to pass its healthcheck before the API will start.

`make logs` / `make prod-logs` tails; `make down` / `make prod-down` stops; `make clean` (dev only) also wipes volumes.

## 2. Open the UI

Visit <http://localhost:3333>. You'll land on the search shell with a galaxy nebula in the background.

There's nothing in the catalog yet, so the search returns no hits. Click the **mode toggle** in the top right to switch to the **galaxy map** — also empty — then back.

## 3. Create your first asset (UI)

Hit **⌘K** (or **Ctrl+K**) to open the command palette. Type `create dataset`. Pick the wizard, fill in:

- **Name:** `customers`
- **Type:** `dataset`
- **Description:** `Customer master table`

Hit **Enter** through the steps, **Enter** to confirm. The asset appears in search.

## 4. Create your first asset (API)

Same thing, via `curl`:

```bash
curl -X POST http://localhost:8100/api/v1/assets \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "dataset",
    "name": "orders",
    "description": "Order header table"
  }'
```

Or via the SDK from a Bun/Node script:

```ts
import { HolocronClient } from '@squat-collective/holocron-ts';

const client = new HolocronClient({ baseUrl: 'http://localhost:8100' });
const asset = await client.assets.create({ type: 'dataset', name: 'orders' });
console.log(asset.uid);
```

See [`packages/sdk-ts/README.md`](../packages/sdk-ts/README.md) for the full SDK surface (Active Record, dirty tracking, typed errors).

## 5. Import a CSV

The `csv-connector` plugin is bundled. Use the CLI:

```bash
# Install the SDK CLI inside the API container (or any Python env)
podman exec -it holocron pip install -e /opt/holocron-plugin-sdk

# Run the connector against a CSV
podman exec -it holocron holocron-plugin run csv-connector \
  --input file=@/app/tests/fixtures/sample.csv \
  --output result.json
```

Or, in the UI: ⌘K → **Import** → **CSV connector** → upload a file → run.

The plugin scans the file, infers column types, parses any `# Owner:` comment headers as Person actors, and creates one `dataset` asset with the schema projected as Container/Field nodes. The result lands `verified: false` so you can review before trusting it.

## 6. Search

Back in the UI search box:

```
customers                 # semantic + keyword across everything
ds:customers              # only datasets
"customer master"         # literal phrase
owner:Tom                 # owned by anyone matching "Tom"
ds:order -archived        # datasets matching "order", excluding "archived"
```

Full reference: [search.md](search.md).

## 7. Visit the galaxy map

Switch to **map mode** (toggle, top right). You'll see your assets and any auto-created actors as floating nodes connected by edges. Click one to focus; **Shift+Enter** to lock; arrow keys / vim keys to navigate.

Full reference: [map.md](map.md).

## 8. Run an audit

```bash
podman exec -it holocron holocron-plugin run lineage-gap-audit \
  --output audit.xlsx
```

Open `audit.xlsx` for tabs covering orphan assets, lineage dead-ends, undocumented assets, dangling rules, unverified entities. There's also `compliance-report` for the governance side and `pii-detector` for PII candidates.

Full reference: [plugins.md](plugins.md).

## 9. Subscribe to events (webhooks)

Register a webhook to receive everything that happens:

```bash
curl -X POST http://localhost:8100/api/v1/webhooks \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://your-receiver.example.com/hook",
    "events": ["*"]
  }'
```

The response includes a `secret` **once** — store it. Every dispatch is HMAC-signed; verify on your end with the recipe in [webhooks.md](webhooks.md).

## 10. Where to next

- Stay in the UI and build out the catalog with wizards.
- Drive everything from the SDK (TypeScript) or the API (any language).
- Plug Holocron into Claude Desktop or Claude Code through the [MCP server](../packages/mcp-server/README.md).
- Write a connector for a system you have but Holocron doesn't ([plugins.md](plugins.md#writing-a-plugin)).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make up` hangs on Neo4j | Wait — first boot is ~30 s. `make logs` to confirm. |
| API returns 502 / connection refused | Neo4j isn't healthy yet. Check `make ps`. |
| UI shows "Failed to fetch" | API isn't reachable from the UI container — confirm `HOLOCRON_API_URL=http://api:8000` is set. |
| Search returns nothing for known assets | Embedding model loads on first request (~1 s, 300 MB). Retry. |
| Plugin not listed at `/api/v1/plugins` | Restart the API — discovery happens at startup via entry points. Confirm the package is bind-mounted in `docker-compose.yml`. |
