# ADR-008: Schema projection — Container/Field nodes

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Tom

## Context

Connectors discover datasets *with schema* — a CSV has columns, an Excel sheet has tables and columns, a Postgres table has columns with types, a Power BI report references tables and fields. The schema lives naturally in the asset's `metadata.schema` field as a nested JSON tree (containers → fields).

But putting it only in `metadata` makes it invisible to:

- **Search.** Users want to find "the `email` field of the `customers` dataset", not just "the `customers` dataset that happens to mention email somewhere".
- **Governance.** Rules apply to specific fields (`pii: true`, `must_be_masked`); we need to attach `:APPLIES_TO` edges scoped to a `field_path`.
- **Lineage.** Column-level lineage between datasets requires column nodes to anchor edges to.

Storing schema as opaque JSON gives us none of those.

## Decision

Materialise the JSON schema tree as real Neo4j nodes:

```
:Asset --(:CONTAINS)--> :Container --(:CONTAINS)--> :Field
```

Triggered automatically whenever an Asset's `metadata.schema` is written. Implemented as a **full rebuild** of that asset's subtree:

1. Tear down: detach-delete every `:Container` and `:Field` reachable from the asset.
2. Materialise: walk the new schema JSON, creating containers and fields with denormalised `asset_uid`, `asset_name`, slash-joined `path` (e.g. `customers/email`).
3. Embed: the embedding service produces a 384-dim vector for each new container and field, populating the same vector + fulltext indexes used by other entity kinds.

Container and Field nodes are **derived state** — they're not directly created or edited via the API. Editing them happens through the parent asset's `metadata.schema`.

Source: `packages/api/src/holocron/core/services/asset_schema_projection.py`.

## Options considered

### 1. Keep schema as JSON in `metadata`

- **Pros:** simple, no projection step.
- **Cons:** invisible to search and governance. Users have to write Cypher to find a column.

### 2. Materialise lazily on first read

- **Pros:** writes stay cheap.
- **Cons:** the first read after a write is slow and unpredictable. Search needs the indexes populated *now*, not on first query. Hard to keep consistent.

### 3. Store as a child Neo4j sub-API (POST `/assets/{uid}/columns`, ...)

- **Pros:** explicit lifecycle.
- **Cons:** users now have two APIs to keep in sync; connectors have to make N+M calls per asset; the JSON in `metadata` becomes ambiguous (which is canonical?).

### 4. Materialise on every write ✅ Selected

- **Pros:** the JSON in `metadata` stays canonical (one source of truth); the graph stays consistent; search and governance work without special-casing schema; connectors only need to set `metadata.schema`.
- **Cons:** every asset write rebuilds the subtree even if the schema didn't change. Cost is bounded by per-asset schema size.

### 5. Diff-based incremental rebuild

- **Pros:** cheaper at scale.
- **Cons:** more code, more failure modes (drifting state if the diff is wrong). Premature for current scale.

## Rationale

JSON in `metadata` is what connectors naturally produce, and it's the easiest authoring path for hand-editing. Materialising on write keeps the JSON canonical (it's the input; the nodes are the output) without forcing a second authoring API. The full rebuild is dumb but correct — diff-based projection can come later if writes become a bottleneck.

The denormalisation of `asset_uid`, `asset_name`, and `path` onto every Container/Field means search results can render "the `email` field of the `customers` table" without a join back to the parent. This trades a little storage for a lot of read simplicity, which is worth it for the catalog scale we target.

## Consequences

### Positive

- Schema is a first-class part of the graph: search, governance, lineage all see fields and containers.
- The JSON in `metadata` stays canonical — no two-source-of-truth problem.
- Connectors are unchanged: just set `metadata.schema`.
- Search hits gain `kind: "container"` and `kind: "field"` for free.
- Rules can attach to specific fields via `field_path` on `:APPLIES_TO`.

### Negative

- Every asset write rebuilds the subtree, even if the schema didn't change.
- At very deep schemas (>1000 fields per asset) the rebuild + embedding cost is noticeable.
- Container/Field UIDs are stable per asset+path but not portable (if the asset is renamed, paths change).

### Mitigations

- Skip the rebuild if the schema field didn't change in the update payload (cheap diff at the route layer — TODO).
- Move embedding to a batch job at scale (the same way the graph layout is currently cached at startup).

## References

- Public reference: [docs/concepts.md#schema-projection](../../concepts.md#schema-projection)
- Implementation: `packages/api/src/holocron/core/services/asset_schema_projection.py`
- Search consumption: `packages/api/src/holocron/core/services/search_schema_nodes.py`
