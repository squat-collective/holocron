# @holocron/mcp-server

> Model Context Protocol server for the Holocron data-governance platform.

## Purpose

Expose Holocron's documentation surface (assets, actors, relations, plugins) as MCP tools + resources so AI assistants can browse and curate the catalog through natural language.

## Structure

```
src/
├── index.ts          # stdio entrypoint (bin: holocron-mcp-server)
├── server.ts         # createServer factory — used by tests and entrypoint
├── client.ts         # thin wrapper over HolocronClient + raw fetch for plugins/verified
├── tools/
│   ├── assets.ts     # registerAssetTools
│   ├── actors.ts     # registerActorTools
│   ├── relations.ts  # registerRelationTools
│   ├── plugins.ts    # registerPluginTools (fetches manifests at startup)
│   ├── search.ts     # registerSearchTool (client-side)
│   ├── helpers.ts    # jsonResult / errorResult
│   └── index.ts      # registerTools + TOOL_NAMES
└── resources/
    ├── catalog.ts    # holocron://assets/{uid}, holocron://actors/{uid}, holocron://schema-overview
    └── index.ts
tests/
└── server.test.ts    # bun test — boot smoke + TOOL_NAMES parity
```

## Conventions

- **TypeScript strict**, NodeNext module resolution, no `any` outside explicit test fakes.
- **MCP SDK:** `@modelcontextprotocol/sdk` high-level `McpServer` (registerTool / registerResource).
- **Inputs:** Zod raw-shape objects — `registerTool("name", { inputSchema: { foo: z.string() } }, handler)`.
- **Outputs:** always wrap results through `jsonResult(payload)` or `errorResult(op, err)` from `tools/helpers.ts`.
- **API calls:** always through the `McpHolocronClient` wrapper. That wrapper delegates to the SDK by default and falls back to raw fetch only for the two endpoints the SDK doesn't expose yet (`/api/v1/plugins`, `/api/v1/plugins/{slug}/run`) and for fields the SDK hasn't picked up (`verified`, `discovered_by`).
- **Errors:** catch inside handlers and convert with `errorResult` — never throw from a registered tool.

## Tools

| Name              | Purpose                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `list_assets`     | List assets; filter by type (dataset/report/process/system).                       |
| `get_asset`       | Fetch one asset by UID.                                                            |
| `create_asset`    | Create a new asset.                                                                |
| `update_asset`    | Partial update of an existing asset.                                               |
| `delete_asset`    | Hard-delete an asset by UID.                                                       |
| `verify_asset`    | Set `verified: true` on a discovered asset.                                        |
| `list_actors`     | List actors; filter by type (person/group).                                        |
| `get_actor`       | Fetch one actor by UID.                                                            |
| `create_actor`    | Create a new actor.                                                                |
| `update_actor`    | Partial update of an existing actor.                                               |
| `delete_actor`    | Hard-delete an actor by UID.                                                       |
| `verify_actor`    | Set `verified: true` on a discovered actor.                                        |
| `list_relations`  | List relations; filter by type / from_uid / to_uid.                                |
| `get_relation`    | Fetch one relation by UID.                                                         |
| `create_relation` | Create a relation (defaults to verified).                                          |
| `delete_relation` | Hard-delete a relation.                                                            |
| `verify_relation` | Inspect a relation — backend does not support toggling `verified` in place yet.    |
| `search`          | Case-insensitive substring match across assets + actors.                           |
| `list_plugins`    | List registered plugins + their input specs.                                       |
| `run_plugin`      | Execute a plugin by slug; file inputs accept a host path and are multipart-encoded. |

## Resources

- `holocron://assets/{uid}` — JSON for a single asset
- `holocron://actors/{uid}` — JSON for a single actor
- `holocron://schema-overview` — Markdown summary (counts by type)

## Local dev

```bash
podman run --rm -v "$(pwd):/app" -w /app/packages/mcp-server oven/bun:1 \
  sh -c "bun install && bun run typecheck && bun test"
```

SDK must be built first (`bun run build` in `packages/sdk-ts/`) so `workspace:*` resolves.

## Open issues / TODO

- Wait for backend `PUT /relations/{uid}` to make `verify_relation` a true flip.
- Pick up `verified` / `discovered_by` typings once the SDK regenerates from the live API.
- Add a `/search` endpoint upstream so the `search` tool can drop the client-side fallback.
