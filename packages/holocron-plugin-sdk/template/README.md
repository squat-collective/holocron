# my-holocron-plugin

> Hello-world template for [Holocron](https://github.com/squat-collective/holocron) plugins.

## Quick start

```bash
# 1. Rename the package
mv src/my_plugin src/your_plugin
# 2. Edit pyproject.toml: project name, entry-point slug, package path
# 3. Edit src/your_plugin/plugin.py: manifest + run()
# 4. Run the tests
pytest
# 5. Install into a Holocron API env (the API auto-discovers it via the entry point)
pip install -e .
```

## What this template does

This is an **EXPORT** plugin: it counts the assets in the catalog and returns a
plain-text file. Replace the body of `run()` with your own logic.

To make an **IMPORT** plugin instead, change `capability=PluginCapability.IMPORT`
in the manifest, declare some `inputs=[InputSpec(...)]`, and return a
`SummaryResult` instead of a `DownloadResult`.

## How `PluginContext` works

At runtime, the Holocron API injects four services:

- `ctx.asset_service` — list/get/create assets
- `ctx.actor_service` — list/get/create actors (people, teams, services)
- `ctx.relation_service` — list/get/create relations
- `ctx.rule_service` — list/get/create governance rules

In tests, these are `None` by default — pass mocks via the `PluginContext`
constructor when you need them. See `tests/test_plugin.py` for an example.

## License

MIT (or whatever you like).
