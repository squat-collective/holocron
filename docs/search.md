# Search

> Hybrid semantic + keyword search across every entity in the catalog, with a small DSL for power users.

`GET /api/v1/search?q=...` is the only search endpoint. The UI calls it directly; the SDK doesn't wrap it yet.

## What it searches

| Result `kind` | Comes from |
|---|---|
| `asset` | `:Asset` nodes |
| `actor` | `:Actor` nodes |
| `rule` | `:Rule` nodes |
| `container` | Schema containers (table, sheet, section) |
| `field` | Schema columns / measures |

Results are interleaved by score, not grouped by kind. A perfectly named field will rank above a vaguely matching asset.

## How scoring works

Every searchable kind has both:

- A **vector index** over a 384-dim embedding of `name + description` (BAAI/bge-small-en-v1.5, ONNX via fastembed, CPU-only).
- A **fulltext index** (Lucene through Neo4j) over `name + description`.

For each query, the API:

1. Parses the query into the structured `ParsedQuery` (filters, kinds, phrases, negations, graph filters — see DSL below).
2. Resolves any graph filters (`owner:`, `uses:`, `feeds:`, `rule_for:`) into UID sets via fulltext.
3. Fans out per-kind rankers: vector top-N + fulltext top-N.
4. Fuses scores with the **probabilistic OR** rule: `combined = 1 − (1 − v) × (1 − fts)`.
5. Applies **kind discounts** so schema nodes don't drown out their parent assets:
   - container × **0.85**
   - field × **0.80**
6. Penalises pure-vector hits when fulltext is dominant: if any FTS hit is above **0.55**, vector-only hits are scaled by **0.55**.
7. Sorts by combined score; ties break by kind order.

Constants live in `packages/api/src/holocron/core/services/search_scoring.py` and have unit tests in `packages/api/tests/unit/test_search_scoring.py`.

See [ADR-005](architecture/adr/005-hybrid-search.md) for the rationale.

## The query DSL

Bare words are semantic + fulltext. Prefixes scope the result kind. A small set of named operators add filters and graph constraints.

### Kind aliases

| Alias | Restricts results to |
|---|---|
| `a:` | Any asset |
| `ds:` | Datasets |
| `dr:` | Reports |
| `dp:` | Processes |
| `dsys:` | Systems |
| `ac:` | Any actor |
| `p:` | People |
| `t:` | Teams / groups |
| `r:` | Rules |
| `c:` | Schema containers |
| `f:` | Schema fields |

Multiple aliases stack: `ds:dr:revenue` returns datasets and reports matching "revenue".

### Type & severity filters

| Filter | Effect |
|---|---|
| `type:dataset` | (when used with `a:`) constrain to a specific asset type |
| `sev:critical` | Rules of severity critical (also `warning`, `info`) |

### Graph filters

| Filter | Effect |
|---|---|
| `owner:<name>` | Owned by an actor matching `<name>` |
| `member:<team>` | Person is a member of a team matching `<team>` |
| `uses:<asset>` | Uses an asset matching `<asset>` |
| `feeds:<asset>` | Anywhere upstream of an asset matching `<asset>` |
| `rule_for:<asset>` | Applies to an asset matching `<asset>` |

Graph filter values resolve through fulltext, so `owner:tom` is fine even if your name is `Tom Blanc`.

### Phrases & negations

| Syntax | Effect |
|---|---|
| `"customer master"` | Literal substring (required) |
| `-archived` or `!archived` | Exclude any result whose name/description contains `archived` |

### Examples

| Query | Meaning |
|---|---|
| `customers` | Anything matching "customers" |
| `ds:customers` | Only datasets matching "customers" |
| `ds: -archived` | All datasets, excluding archived ones |
| `f:email sev:warning` | Fields named `email` (any kind) — `sev:` is ignored when no rules are in scope |
| `owner:Tom feeds:revenue_mart` | Things Tom owns that feed the revenue mart |
| `r: rule_for:customers` | Rules applied to the `customers` asset |
| `"PII"` | Anything mentioning literal "PII" |

## Forgiveness rules

The parser is intentionally lax:

- Unknown aliases fall back to plain text (`xyz:foo` becomes a semantic search for `xyz:foo`).
- Typos in operator names silently become semantic queries — they don't error out.
- Empty `q` is allowed and returns the most recently updated entities.

The trade-off is power-user comfort vs. error feedback. If you want strict validation, use the SDK's typed helpers (when they ship for search).

## Response shape

```json
{
  "items": [
    {
      "uid": "ast-...",
      "kind": "asset",
      "name": "customers",
      "type": "dataset",
      "description": "...",
      "score": 0.84,
      "highlight": ["...customer<strong>s</strong>..."]
    },
    ...
  ],
  "total": 17
}
```

`kind` is always present and is one of `asset`, `actor`, `rule`, `container`, `field`.

## Performance notes

- Embedding model is loaded **lazily** on first search request (~1 s, ~300 MB resident). After that, queries are sub-100 ms typical.
- Vector indexes are populated synchronously on entity write — first search after a bulk import will reflect new entities immediately.
- Schema projection rebuilds on every asset update; large schemas (>1k fields) make writes slower. There's a TODO to move to a batch job.

## Known gaps

- No saved searches or query templates.
- No relevance feedback (clicks aren't fed back into ranking).
- No relations fetch from search hit (would need a follow-up call to `/relations`).
- DSL aliases are hardcoded — not extensible without a code change.
