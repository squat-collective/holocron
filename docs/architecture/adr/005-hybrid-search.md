# ADR-005: Hybrid vector + fulltext search

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Tom

## Context

Holocron needs catalog-wide search that finds the right entity whether the user types:

- a literal substring of a column name (`customer_id`),
- a fuzzy concept (`who owns the orders mart`),
- a quoted phrase (`"Q4 sales"`),
- a graph constraint (`owned by Tom and feeding the revenue mart`).

Pure keyword search misses semantic intent. Pure vector search misses literal matches and is awful at "find me the column literally called `email`". Both give bad results when the catalog has many similarly-named entities (asset → schema container → field).

We need ranking that combines both signals, doesn't drown parent assets in their own columns, and has a small DSL for power users.

## Decision

Run both rankers per kind and **fuse their scores with a probabilistic OR**:

```
combined = 1 − (1 − v_score) × (1 − fts_score)
```

On top of that:

- **Per-kind discounts** so schema nodes don't dominate their parents:
  `container × 0.85`, `field × 0.80`.
- **Vector-only penalty** when fulltext is dominant: if any FTS hit ≥ `0.55`, all pure-vector hits are scaled by `0.55`. This prevents a soft-matching asset from outranking a literal-matching field.
- **Per-kind cap** of 20 hits to keep response sizes bounded.
- **Tiebreak by kind order** so deterministic results for equal scores.

Embeddings: `BAAI/bge-small-en-v1.5` (384-dim, cosine) via fastembed (ONNX, CPU-only, ~300 MB resident, ~1 s warm-up). Indexed in Neo4j vector indexes alongside Lucene fulltext indexes on `name + description`.

DSL: bare words = semantic + fulltext; prefixes (`ds:`, `f:`, `r:`) scope kind; named operators (`owner:`, `feeds:`, `rule_for:`, `member:`, `uses:`) resolve to UID sets via fulltext and constrain results; `"phrase"` requires literal substring; `-term` excludes.

## Options considered

### 1. Pure keyword (Lucene only)

- **Pros:** simple, fast, no model download, works offline.
- **Cons:** misses semantic intent, awful at typos and synonyms, no relevance to query meaning.

### 2. Pure vector

- **Pros:** semantic match, ranks "concept matches" well.
- **Cons:** terrible at literal lookups (`SELECT email FROM ...`), terrible at proper nouns, returns lots of "kinda close" garbage when nothing exists.

### 3. External search engine (Elasticsearch / OpenSearch / Qdrant)

- **Pros:** purpose-built, more knobs.
- **Cons:** extra service to operate, sync to maintain, second source of truth. Not justified for the catalog sizes Holocron targets.

### 4. Hybrid in Neo4j ✅ Selected

- **Pros:** one storage layer, one transaction model, one operational footprint. Both index types are first-class in Neo4j 5.
- **Cons:** Neo4j's vector indexes are newer than dedicated vector DBs; tuning is up to us.

## Rationale

The catalog is small enough (target: tens of thousands of entities) that there's no operational case for a separate search service. Fusing both signals in one query keeps the architecture simple. The discounts and penalties were tuned empirically against the Star Wars fixture and the dogfood catalog — they're constants and live in `core/services/search_scoring.py` so they're easy to revisit.

The DSL is intentionally lax (unknown operators silently fall through to plain text). That's a power-user comfort vs. error-feedback trade-off. The expected user is technical and forgiving.

## Consequences

### Positive

- One database, one set of indexes, one query path.
- Hybrid ranking handles both literal and semantic queries well.
- Scoring constants are pure data — easy to tune, easy to test (`tests/unit/test_search_scoring.py`).
- Schema nodes are searchable individually but don't drown parent assets.

### Negative

- Embedding model adds memory pressure (~300 MB resident).
- First search after API start is slow until the model is loaded.
- Tuning constants is empirical; no automated relevance test.
- Neo4j vector indexes are newer; behaviour at scale (millions of entities) is less proven than dedicated vector DBs.

### Mitigations

- Pre-warm the model at boot if needed.
- Move to a dedicated vector store (Qdrant or similar) only when catalog size or query volume justifies the operational cost.

## References

- [Neo4j vector indexes](https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/)
- [Neo4j fulltext indexes](https://neo4j.com/docs/cypher-manual/current/indexes/search-performance-indexes/full-text-indexes/)
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)
- Implementation: `packages/api/src/holocron/core/services/search_*.py`
- Public reference: [docs/search.md](../../search.md)
