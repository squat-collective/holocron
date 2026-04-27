# Plugins

> Connectors push, exporters pull, audits report. All of it runs through the same plugin contract — auto-discovered at API startup, driven by manifest, invoked over HTTP.

## How plugins work

1. A plugin is a Python package that exposes two attributes from one module:
   - `manifest: PluginManifest` — slug, name, capability, inputs, etc.
   - `run: async (ctx: PluginContext, inputs: dict) -> SummaryResult | DownloadResult`
2. The package registers itself via the `holocron.plugins` entry point in `pyproject.toml`.
3. The API discovers the entry-point group at startup (`PluginRegistry.discover()`), loads each module, and exposes them at:
   - `GET /api/v1/plugins` — list of manifests.
   - `POST /api/v1/plugins/{slug}/run` — multipart form invocation.
4. Inside `run()`, the plugin gets a `PluginContext` carrying the API's service layer (`asset_service`, `actor_service`, `relation_service`, `rule_service`, `event_service`) — so it can read and mutate the catalog without going through HTTP.
5. The result is either a `SummaryResult` (returned as JSON) or a `DownloadResult` (streamed with `Content-Disposition: attachment`).

There is **one** plugin contract and it lives in the [`holocron-plugin-sdk`](../packages/holocron-plugin-sdk/) package — both the API and every plugin import from there.

See [ADR-006](architecture/adr/006-plugin-sdk-entry-points.md) for the design choice; [ADR-003](architecture/adr/003-reader-plugin-architecture.md) records the original "reader" design that this supersedes.

## Catalog

### Connectors (IMPORT)

Pull metadata from somewhere, push it into the catalog.

| Slug | Source | UID strategy | Notes |
|---|---|---|---|
| [`csv-connector`](../packages/connector-csv) | A `.csv` / `.tsv` / `.txt` file | `sha256("csv:dataset:" + abs_path)[:32]` | Sniffs encoding, delimiter, types. Parses `# Owner:` comment headers as Person actors. |
| [`excel-connector`](../packages/connector-excel) | An `.xlsx` workbook | `sha256(abs_path + "#" + sheet + "#" + table)[:32]` | Sheets, ListObjects, heuristic tables, formula lineage (VLOOKUP/XLOOKUP/INDEX-MATCH), cross-file refs, owners from custom properties. |
| [`postgres-connector`](../packages/connector-postgres) | PostgreSQL host + schema | `sha256("postgres:dataset:" + host + ":" + port + "/" + db + "/" + schema + "." + table)[:32]` | One dataset per table/view with column schema. No FK lineage in v0.1. |
| [`powerbi-connector`](../packages/connector-powerbi) | A `.pbix` file | derived from filename + table name | Parses Layout JSON, walks DAX visual queries, emits report + referenced tables + `uses` edges. |

All connectors land items as `verified: false, discovered_by: "<slug>@<version>"` so a human can review before trusting.

### Exporters (EXPORT)

Pull the catalog, serialise it.

| Slug | Output | Use it for |
|---|---|---|
| [`excel-exporter`](../packages/exporter-excel) | One `.xlsx` with tabs: Overview, Assets, Actors, Relations, Schemas, Lineage | Offline review, share-with-stakeholder, round-trip back through `excel-connector`. |
| [`data-dictionary-markdown`](../packages/exporter-markdown) | Zip of Markdown pages: `README.md`, `assets/<slug>.md`, `actors/<slug>.md` | Drop into a docs site, browse on GitHub, feed to LLMs as context. |

### Extensions (audit & analysis)

Read the catalog, return findings or diagnostics.

| Slug | Capability | Output |
|---|---|---|
| [`lineage-gap-audit`](../packages/audit-lineage-gaps) | EXPORT | `.xlsx` with orphan assets, lineage dead-ends, undocumented entities, dangling rules, unverified items. |
| [`compliance-report`](../packages/compliance-report) | EXPORT | `.xlsx` with rules-in-force, PII inventory, ownership matrix, recent verifications, coverage stats. |
| [`pii-detector`](../packages/pii-detector) | IMPORT | `SummaryResult` flagging high/medium-confidence PII fields based on name patterns. **Read-only** in v1 — reviewers apply flags via `Edit field → toggle PII`. |

## Writing a plugin

The SDK ships a working template. Clone it, rename the package, edit `manifest` and `run()`, run the tests:

```bash
cp -r $(python -c "import holocron_plugin_sdk, pathlib; print(pathlib.Path(holocron_plugin_sdk.__file__).parent.parent.parent / 'template')") my-plugin
cd my-plugin
# 1. Edit pyproject.toml: rename package, set entry-point slug
# 2. Edit src/<your_pkg>/plugin.py
pytest
```

A minimum viable plugin:

```python
from holocron_plugin_sdk import (
    DownloadResult,
    PluginCapability,
    PluginContext,
    PluginManifest,
)

manifest = PluginManifest(
    slug="my-plugin",
    name="My Plugin",
    description="Does a useful thing.",
    icon="✨",
    capability=PluginCapability.EXPORT,
    inputs=[],
)

async def run(ctx: PluginContext, _inputs: dict) -> DownloadResult:
    page = await ctx.asset_service.list(limit=1, offset=0)
    body = f"Catalog has {page.total} assets.\n".encode()
    return DownloadResult(filename="hello.txt", content_type="text/plain", body=body)
```

Register it in `pyproject.toml`:

```toml
[project.entry-points."holocron.plugins"]
my-plugin = "my_plugin.plugin"
```

Mount the package into the API container (`docker-compose.yml`, see how the existing `connector-*` packages are wired) and restart — discovery happens at startup.

### Inputs

`InputSpec` drives both the API's multipart parsing and the UI's auto-generated form. Three input types exist:

| `InputType` | UI control | Reaches your `run()` as |
|---|---|---|
| `STRING` | text field | `str` |
| `BOOLEAN` | checkbox | `"true"` / `"false"` (string — coerce yourself) |
| `FILE` | file picker | `starlette.datastructures.UploadFile` (call `await file.read()`) |

```python
from holocron_plugin_sdk import InputSpec, InputType

manifest = PluginManifest(
    ...,
    inputs=[
        InputSpec(name="file", type=InputType.FILE, label="CSV file", required=True),
        InputSpec(name="dry_run", type=InputType.BOOLEAN, label="Dry run", required=False),
        InputSpec(name="owner", type=InputType.STRING, label="Override owner email"),
    ],
)
```

### Result types

| Return | Use when |
|---|---|
| `SummaryResult(title, counts, samples, extra)` | The plugin reports something; the UI/CLI should display structured info. Pair with `PluginCapability.IMPORT`. |
| `DownloadResult(filename, content_type, body)` | The plugin produced a file. The API streams it back with `Content-Disposition: attachment`. Pair with `PluginCapability.EXPORT`. |

### Conventions

- Set `verified=False` and `discovered_by="<slug>@<version>"` on anything you create — it's the audit trail.
- Use **deterministic UIDs** (hash of source identity) so re-runs upsert instead of duplicating.
- Keep `manifest.icon` to a single emoji — that's what shows on the UI plugin card.
- Don't import from `holocron.*` — only from `holocron_plugin_sdk`. The SDK is the public boundary.
- mypy strict, pydantic 2.10+. Same conventions as the rest of the monorepo.

## The CLI

`holocron-plugin` is bundled with the SDK and lets you drive a running API from a terminal — useful for cron, CI, scripted bulk runs, and debugging.

```bash
# List every registered plugin
holocron-plugin list --api http://localhost:8100

# Inspect one manifest as JSON
holocron-plugin show data-dictionary-markdown

# Invoke an EXPORT plugin (saves via Content-Disposition or to -o)
holocron-plugin run data-dictionary-markdown
holocron-plugin run lineage-gap-audit -o audit.xlsx

# Invoke an IMPORT plugin with mixed input types
holocron-plugin run csv-connector \
  --input file=@/data/orders.csv \
  --input dry_run=true \
  --input owner=jean@acme.com
```

**Defaults.** `--api` falls back to `HOLOCRON_API_URL` then `http://localhost:8100`. `--token` adds `Authorization: Bearer ...` (the API is open in dev — the flag is wired up so adding auth later is non-breaking).

**Input parsing.** `--input` is repeatable. Values prefixed with `@` are file paths (multipart). The strings `true` / `false` (any case) become booleans. Anything else is a string.

**Output.** JSON responses pretty-print to stdout (or to `-o file.json`). Binary responses save to `-o`, falling back to the filename in the server's `Content-Disposition` header.

## Operational concerns

- **Plugins share the API process.** A misbehaving plugin can affect API performance. Treat plugins like first-party code.
- **Discovery is at startup.** Adding or removing a plugin needs an API restart.
- **Errors propagate.** A `ValueError` from `run()` becomes a 422 with the message; everything else becomes a 500. Use `ValueError` for user-facing input problems.
- **No persistent job queue.** Plugin runs are synchronous from the API's point of view (the request is held open until the plugin returns). Long-running scans are fine but consume an API worker.
