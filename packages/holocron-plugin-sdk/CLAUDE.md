# Holocron Plugin SDK 🧩

> The public, third-party-friendly plugin contract. No FastAPI, no Neo4j, no `holocron.*` imports.

## Why this package exists

The 8 first-party plugins import from `holocron.plugins.base` — fine for monorepo work, hostile for anyone who wants to write a plugin without pulling the whole API in. This package re-exports the public contract so external authors `pip install holocron-plugin-sdk` and stay decoupled from the API.

## Module map

| File | Responsibility |
|---|---|
| `src/holocron_plugin_sdk/__init__.py` | Public re-exports. Plugin authors import only from here. |
| `src/holocron_plugin_sdk/base.py` | Single source of truth for the SDK's copy of the types — kept in lockstep with `packages/api/src/holocron/plugins/base.py`. |
| `template/` | A runnable hello-world plugin. `cp -r` it, rename, edit, test. |

## Conventions

- **Zero coupling to the API.** The SDK must be installable in an env that does not have `holocron` (the API package). If a new field on `PluginContext` requires importing an API service, type it as `Any | None` — concrete services are injected at runtime by the API.
- **Mirror, don't import.** Keep the type definitions verbatim from `holocron.plugins.base` (the API's copy). They're the same Pydantic schema; both sides are authoritative for their respective import path.
- **Backward compatibility.** The API package keeps re-exporting `holocron.plugins.base` so the 7 unmigrated plugins still work. The SDK is the recommended path going forward.
- **Strict typing.** mypy strict + ruff. No `Any` outside the `PluginContext` service fields.
- **Containerized.** `make test`, `make typecheck` — never install on host.

## When to bump the major version

If `PluginManifest` / `Plugin` Protocol changes shape (renamed field, new required field, removed type), bump major. Adding a new optional field is a minor bump. The API's copy and this SDK's copy must move in lockstep — stale SDK + new API combinations will cause Pydantic validation errors at startup.
