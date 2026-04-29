# @squat-collective/holocron-mcp-server

> Model Context Protocol server that exposes the Holocron data-governance catalog to AI assistants (Claude Desktop, Claude Code, and any other MCP client).

The server wraps the in-tree [`@squat-collective/holocron-ts`](../sdk-ts) SDK and surfaces it as MCP tools so Claude can browse the catalog, create and edit assets / actors / relations / rules, verify discovered items, and invoke import/export plugins — all over the Model Context Protocol.

Part of the [Holocron monorepo](../../README.md). Cross-cutting docs in [`docs/`](../../docs/README.md).

## Tools

| Group | Tools |
|---|---|
| **Assets** | `list_assets`, `get_asset`, `create_asset`, `update_asset`, `delete_asset`, `verify_asset` |
| **Actors** | `list_actors`, `get_actor`, `create_actor`, `update_actor`, `delete_actor`, `verify_actor` |
| **Relations** | `list_relations`, `get_relation`, `create_relation`, `delete_relation`, `verify_relation` |
| **Rules** | `list_rules`, `get_rule`, `create_rule`, `update_rule`, `delete_rule`, `list_rules_for_asset`, `attach_rule`, `detach_rule` |
| **Schema** | `get_asset_schema`, `add_schema_container`, `add_schema_field`, `update_schema_node`, `delete_schema_node` — author the `metadata.schema` tree of containers + fields without round-tripping the full asset. |
| **Resolver** | `get_entity` — UID → typed payload (asset / actor / rule), so AI agents don't have to guess the label |
| **Catalog-wide** | `search` — substring match across assets + actors; `list_tags`; `get_graph_map` (LOD 0/1); `list_events` |
| **Plugins** | `list_plugins`, `run_plugin` (file inputs by host path) |

The full canonical list lives in `src/tools/index.ts` (`TOOL_NAMES`).

## Resources

- `holocron://assets/{uid}` — JSON for one asset
- `holocron://actors/{uid}` — JSON for one actor
- `holocron://schema-overview` — Markdown summary (counts by type)

## Install

Everything runs through Bun inside containers — no host installs.

```bash
# from repo root: typecheck + tests
podman run --rm -v "$(pwd):/app" -w /app/packages/mcp-server oven/bun:1 \
  sh -c "bun install && bun run typecheck && bun test"

# Build the SDK first (workspace:* dep)
podman run --rm -v "$(pwd):/app" -w /app/packages/sdk-ts oven/bun:1 bun run build

# Build the MCP server
podman run --rm -v "$(pwd):/app" -w /app/packages/mcp-server oven/bun:1 bun run build
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `HOLOCRON_API_URL` | `http://localhost:8100` | Base URL of the Holocron API |
| `HOLOCRON_TOKEN` | _(unset)_ | Optional bearer token (the API is open in dev) |

## Claude Desktop / Claude Code config

### Recommended: prebuilt GHCR image

Each tagged release publishes `ghcr.io/squat-collective/holocron-mcp-server:vX.Y.Z` (multi-arch, alongside `holocron-api` and `holocron-ui`). Drop this into your client's MCP config:

```json
{
  "mcpServers": {
    "holocron": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--network", "holocron",
        "-e", "HOLOCRON_API_URL=http://api:8000",
        "ghcr.io/squat-collective/holocron-mcp-server:latest"
      ]
    }
  }
}
```

The `--network holocron` arg attaches to the network created by `compose.prod.yml`, so the MCP container can reach the API by service name without exposing a host port. Pin the tag (`:v0.1.0-alpha`) for stability.

If you used `install.sh` to deploy the stack, run

```bash
./install.sh --print-mcp-config
```

to get the same snippet pinned to your installed version, with `HOLOCRON_TOKEN` injected from `.env` if set.

### Local-source fallback

For dev-loop iteration without rebuilding the image:

```json
{
  "mcpServers": {
    "holocron": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/holocron/packages/mcp-server/src/index.ts"
      ],
      "env": { "HOLOCRON_API_URL": "http://localhost:8100" }
    }
  }
}
```

## Library usage

```ts
import { createServer } from "@squat-collective/holocron-mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const { server } = await createServer({
  baseUrl: "http://localhost:8100",
  token: "optional-bearer-token",
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Development

```bash
bun run dev          # stdio server with auto-reload
bun run typecheck
bun test
```

## Known limitations

- The Holocron API has no `PUT /relations/{uid}` (relations are immutable — delete + recreate). `verify_relation` returns the relation's current state plus a note rather than flipping a flag. Create-time verification (`create_relation`) works as expected.
- `search` here is implemented client-side (list + substring filter across assets and actors). The richer hybrid-search endpoint at `/api/v1/search` exists in the API but isn't wrapped yet — it'll show up as a separate tool once the SDK gains a typed wrapper for it. See [docs/search.md](../../docs/search.md) for what the hybrid endpoint can do today.
- The SDK's TypeScript types for `verified` / `discovered_by` lag the running API for some entity kinds; tool handlers pass these through via safe casts.
