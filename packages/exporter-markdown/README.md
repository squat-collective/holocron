# Data Dictionary (Markdown) 📘

Holocron plugin that exports the entire catalog as a zip of Markdown
pages — one file per asset, one per actor, plus an index `README.md`.

The output is git-friendly, browses cleanly on GitHub or any static
site host, and works as drop-in context for an LLM that needs to "know
the catalog."

## Output layout

```
holocron-data-dictionary-YYYYMMDD-HHMMSS.zip
├── README.md           # index + counts
├── assets/
│   └── <slug>.md       # one per asset (description, schema, owners, lineage)
└── actors/
    └── <slug>.md       # one per actor (description, owned/used assets)
```

Slugs are derived from the entity name; UIDs are used as a fallback if
the name produces an empty slug (e.g. all-punctuation names).

## Running it

The plugin is invoked through the regular `/api/v1/plugins/{slug}/run`
flow — pick "Data Dictionary (Markdown)" in the ⌘K palette and the UI
streams the zip to the browser.
