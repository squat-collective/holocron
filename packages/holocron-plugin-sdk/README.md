# holocron-plugin-sdk 🧩

> Public plugin contract for [Holocron](https://github.com/squat-collective/holocron).
> `pip install holocron-plugin-sdk`, drop a manifest + an `async run()`, and your
> plugin lights up in the Holocron UI.

## Why this package

Holocron plugins are auto-discovered through the `holocron.plugins` entry point.
Every plugin needs to expose two attributes — a `PluginManifest` and an async
`run()` callable — that match the structural `Plugin` Protocol. This package
ships those types so plugin authors don't have to depend on the whole API.

## Write your first plugin in 10 minutes

```bash
cp -r $(python -c "import holocron_plugin_sdk, pathlib; print(pathlib.Path(holocron_plugin_sdk.__file__).parent.parent.parent / 'template')") my-plugin
cd my-plugin
# edit pyproject.toml: rename the package + plugin slug
# edit src/<your_pkg>/plugin.py
pytest
```

The template is a working "hello-world" EXPORT plugin: it returns a tiny text
file with the catalog asset count. Replace the body of `run()` with your logic.

## Public API

```python
from holocron_plugin_sdk import (
    # Manifest schema
    PluginManifest,
    InputSpec,
    InputType,
    PluginCapability,

    # Result types
    SummaryResult,
    DownloadResult,
    PluginResult,

    # Runtime contract
    Plugin,         # Protocol every plugin module must satisfy
    PluginContext,  # services injected by the API at runtime
)
```

`PluginContext` exposes the API's service layer (`asset_service`,
`actor_service`, `relation_service`, `rule_service`). In the SDK they're typed
as `Any | None` so the SDK doesn't pull in the whole API package — at runtime
the API injects concrete services; in your tests, mock them with `unittest.mock`
or stub objects.

## Manifest cheat-sheet

| Field | What it does |
|---|---|
| `slug` | URL-safe id, must be unique across all plugins |
| `name`, `description`, `icon` | What the UI card shows |
| `capability` | `IMPORT` (returns `SummaryResult`) or `EXPORT` (returns `DownloadResult`) |
| `inputs` | `InputSpec[]` — drives both API multipart parsing and UI form rendering |
| `review_link` | Optional UI hint: deep-link to a filter view of unverified items |

## Registration

Add this to your `pyproject.toml`:

```toml
[project.entry-points."holocron.plugins"]
my-plugin-slug = "my_plugin.plugin"
```

The Holocron API will discover and load the module on startup.

## `holocron-plugin` CLI

The SDK ships a `holocron-plugin` command for talking to a running Holocron API
from a terminal. Useful for cron-driven audits, CI integration, or scripted
bulk runs.

```bash
# List every registered plugin
holocron-plugin list --api http://localhost:8100

# Inspect a manifest
holocron-plugin show data-dictionary-markdown

# Invoke an EXPORT plugin (saves to ./report.zip via Content-Disposition)
holocron-plugin run data-dictionary-markdown

# Invoke an IMPORT plugin with mixed input types
holocron-plugin run csv-connector \
    --input file=@/data/orders.csv \
    --input dry_run=true \
    --input owner=jean@acme.com
```

**Defaults.** `--api` falls back to the `HOLOCRON_API_URL` env var, and finally
to `http://localhost:8100`. `--token` adds a bearer header (the API is
unauth'd in dev — the flag is wired up-front so adding auth later is
non-breaking).

**Input parsing.** `--input` is repeatable. Values prefixed with `@` are
treated as file paths and uploaded as multipart parts. The literal strings
`true` / `false` (any case) become booleans. Anything else is a string.

**Output.** JSON responses (IMPORT plugins) pretty-print to stdout — pass
`-o file.json` to redirect. Binary responses (EXPORT plugins) save to `-o`
or, when omitted, to the filename advertised in the server's
`Content-Disposition` header.

## License

MIT
