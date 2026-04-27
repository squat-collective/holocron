# ADR-006: Plugin SDK + entry-point discovery

**Date:** 2026-04-26
**Status:** Accepted (supersedes [ADR-003](003-reader-plugin-architecture.md))
**Deciders:** Tom

## Context

The MVP-era "reader" system ([ADR-003](003-reader-plugin-architecture.md)) had two assumptions that didn't survive contact with real use:

1. **"Suggest don't write."** Readers returned `Suggestion` objects; humans turned them into entities through a separate API call. Every connector ended up reimplementing the suggest→create plumbing, and the human-in-the-loop step was a friction point for batch imports — most users wanted "scan and ingest". The audit trail was already provided by `verified: false` + `discovered_by`, so the additional approval step was redundant.

2. **Reader-only.** Real workflows needed exporters (catalog → file), audit plugins (catalog → findings), and detector plugins (catalog → suggestions for review). Naming everything a "reader" was misleading.

We also needed a way for third parties to author plugins without depending on the whole API package (which pulls in FastAPI, Neo4j, embeddings, ...).

## Decision

Replace readers with a unified **plugin** system:

1. **Public SDK package** (`holocron-plugin-sdk`) with the manifest, input spec, result types, runtime context, and Protocol that every plugin satisfies. The API package depends on the SDK; plugins depend only on the SDK.
2. **Entry-point discovery.** Plugins register via the `holocron.plugins` entry-point group in `pyproject.toml`. The API discovers them at startup (`importlib.metadata.entry_points(group="holocron.plugins")`) — no filesystem scan, no manual registry.
3. **In-process invocation.** `POST /api/v1/plugins/{slug}/run` parses multipart inputs against the manifest, builds a `PluginContext` carrying the API's service layer (`asset_service`, `actor_service`, `relation_service`, `rule_service`, `event_service`), and awaits `plugin.run(ctx, inputs)`.
4. **Two capability families.** `IMPORT` returns `SummaryResult` (JSON); `EXPORT` returns `DownloadResult` (streamed file). Audit and detector plugins fit naturally into one of these.
5. **CLI bundled with the SDK.** `holocron-plugin list / show / run` for terminal-driven invocation, automation, and CI.
6. **Drop "suggest don't write".** Plugins write directly through services. The audit trail is `verified: false` + `discovered_by: "<slug>@<version>"`, surfaced in the UI as a review queue.

## Options considered

### 1. Keep the reader system, add exporters separately

- **Pros:** less churn.
- **Cons:** parallel plumbing for two APIs; readers and exporters end up duplicating manifest/discovery logic.

### 2. One generic system, but configured by manifest files (YAML)

- **Pros:** language-agnostic.
- **Cons:** extra layer to maintain, harder to test, no help from the type system. Python entry points are already a solved problem.

### 3. Out-of-process plugins (subprocess)

- **Pros:** isolation; bad plugin can't crash the API.
- **Cons:** IPC overhead, harder to debug, harder to share types. Premature for the current scale; revisit if/when plugins become untrusted.

### 4. Generic plugin system with entry-point discovery + public SDK ✅ Selected

- **Pros:** single contract, single discovery mechanism, single result-type set; SDK lets third parties build without depending on the API; entry points are the standard Python plugin idiom.
- **Cons:** plugins share the API process (a bad plugin can affect API performance); discovery only happens at startup (restart needed to add/remove).

## Rationale

Entry points are how Python plugins work. Reusing the standard mechanism means tooling (introspection, packaging, documentation) all just works. The SDK split is the key piece that enables third-party plugin authoring without dragging in FastAPI / Neo4j as dependencies.

Dropping "suggest don't write" reflects what users actually do: import everything, then sweep through the unverified set in the UI. The original design front-loaded the cost of approval before any data was in the catalog; the new design defers it, which matches how data teams actually work.

## Consequences

### Positive

- One mental model, one API surface for connectors, exporters, audit, detection.
- Third parties can write plugins without depending on the API package.
- The CLI gives automation parity with the UI.
- `PluginContext` makes plugins as powerful as built-in services — no awkward intermediate APIs.

### Negative

- Plugins share process memory with the API (a bad plugin can affect API performance).
- Discovery is at startup; adding/removing a plugin requires an API restart.
- No persistent job queue — plugin runs are synchronous for the request lifetime.

### Mitigations

- Treat plugins as first-party code; lint/typecheck/test in CI.
- Document the `verified: false` + `discovered_by` audit pattern as the standard.
- If async/long-running plugins become common, add a job queue separately (don't change the synchronous contract).

## Migration from ADR-003

| Old | New |
|---|---|
| `BaseReader` class with `name`, `description`, `supported_sources`, `scan()` | `PluginManifest` dataclass + `async run(ctx, inputs)` |
| `Suggestion` / `ScanResult` | `SummaryResult` (IMPORT) / `DownloadResult` (EXPORT) |
| `POST /api/v1/readers/{name}/scan` | `POST /api/v1/plugins/{slug}/run` |
| `GET /api/v1/readers` | `GET /api/v1/plugins` |
| Filesystem scan of `plugins/` directory | `importlib.metadata.entry_points(group="holocron.plugins")` |
| Plugins return suggestions; humans create entities | Plugins write directly with `verified: false`; humans review in UI |

## References

- Public reference: [docs/plugins.md](../../plugins.md)
- SDK package: `packages/holocron-plugin-sdk/`
- Plugin host: `packages/api/src/holocron/plugins/`
- Built-ins: every `packages/connector-*`, `packages/exporter-*`, `packages/audit-*`, `packages/compliance-report`, `packages/pii-detector`
