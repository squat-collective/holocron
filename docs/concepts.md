# Concepts

> The data model in one page.

Holocron stores everything as a Neo4j graph. There are five top-level entity kinds, two derived schema kinds, six relationship types, and a small set of enums. Read this once and the rest of the docs make sense.

## Entities

| Kind | Label(s) | What it is |
|---|---|---|
| **Asset** | `:Asset` + one of `:Dataset` `:Report` `:Process` `:System` | A piece of data or something that produces/consumes data. |
| **Actor** | `:Actor` + `:Person` or `:Group` | A human or a team. |
| **Rule** | `:Rule` | A governance/quality rule (e.g. "must have an owner", "PII must be masked"). |
| **Event** | `:Event` | An immutable audit record of a mutation. |
| **Webhook** | `:Webhook` | An outbound subscriber (URL + events). |
| **Container** | `:Container` | A schema container — a table, sheet, section. |
| **Field** | `:Field` | A schema column / measure. |

Containers and Fields aren't created by API consumers — they're materialised by the **schema projection** (see below) when an Asset's `metadata.schema` is updated.

### Multi-label nodes

Assets and Actors carry both a base label (`:Asset`, `:Actor`) and a type-specific label (`:Dataset`, `:Person`, ...). This is Neo4j's recommended pattern and lets queries scope at either level:

```cypher
MATCH (a:Asset)        RETURN a       // every kind of asset
MATCH (d:Dataset)      RETURN d       // only datasets
MATCH (p:Person)-[:OWNS]->(a:Asset) RETURN a   // assets owned by a person
```

See [ADR-004](architecture/adr/004-multi-label-node-model.md).

### Common fields

Every entity has:

- `uid` (string, unique) — assigned at creation, never reused.
- `name` (string) — display label.
- `description` (string, optional).
- `verified` (bool) — was this confirmed by a human, or is it a plugin's guess?
- `discovered_by` (string, optional) — `<plugin-slug>@<version>` if a plugin created it.
- `created_at`, `updated_at` (datetime).
- `metadata` (JSON object) — anything that doesn't fit a typed field.
- `embedding` (384-dim float vector) — populated by the embedding service (BAAI/bge-small-en-v1.5).

`Webhook` adds `url`, `events`, `secret`, `failure_count`, `last_error`, `last_fired_at`, `disabled`. `Event` adds `action`, `entity_type`, `entity_uid`, `actor_uid`, `timestamp`, `changes`.

## Relationships

| Type | Source | Target | Properties | Meaning |
|---|---|---|---|---|
| `:OWNS` | Actor | Asset | — | Who is responsible for this asset. |
| `:USES` | Actor or Asset | Asset | — | Who consumes this asset. |
| `:FEEDS` | Asset | Asset | — | **Lineage** — source → target. |
| `:CONTAINS` | Asset or Container | Container or Field | — | Schema tree membership (Asset → Container → Field). |
| `:MEMBER_OF` | Person | Group | — | Team membership. |
| `:APPLIES_TO` | Rule | Asset | `enforcement`, `field_path`, `note` | A rule attached to an asset, optionally scoped to a field. |

Relations are immutable: the only edits are create and delete. To change a relation, delete and recreate it.

### Lineage vocabulary

Holocron uses **only `:FEEDS`** for lineage. There's no separate `:PRODUCES` / `:CONSUMES` / `:DERIVED_FROM`. A process that loads a mart is just an `Asset(type=process)` with `feeds` going in (from sources) and `feeds` going out (to the mart):

```
sources (datasets) -[:FEEDS]→ ETL job (process) -[:FEEDS]→ data mart (dataset)
```

This keeps the graph asset-only and makes lineage walks trivial: `MATCH (a)-[:FEEDS*]->(downstream)`.

## Enums

| Enum | Values |
|---|---|
| `AssetType` | `dataset`, `report`, `process`, `system` |
| `AssetStatus` | `draft`, `active`, `deprecated` |
| `ActorType` | `person`, `group` |
| `RelationType` | `owns`, `uses`, `feeds`, `contains`, `member_of`, `applies_to` |
| `RuleSeverity` | `info`, `warning`, `critical` |
| `RuleEnforcement` (on `:APPLIES_TO`) | `enforced`, `alerting`, `documented` |
| `EventAction` | `created`, `updated`, `deleted` |
| `EntityType` (on events) | `asset`, `actor`, `relation`, `rule` |

## Schema projection

When you write an Asset whose `metadata.schema` describes containers and fields, the API materialises that JSON into real graph nodes:

```
:Asset --(:CONTAINS)--> :Container --(:CONTAINS)--> :Field
```

- Container/Field nodes carry a denormalised `asset_uid`, `asset_name`, and slash-joined `path` so search can show "the `email` field of the `customers` table".
- Each gets its own embedding and lives in the vector + fulltext indexes — column-level search works out of the box.
- The projection is **rebuilt** on every asset write: tear down the old subtree, materialise the new one. Simple and consistent; the cost is bounded by the per-asset schema size.

Source: `packages/api/src/holocron/core/services/asset_schema_projection.py`.

See [ADR-008](architecture/adr/008-schema-projection.md).

## Audit trail (Events)

Every mutation logs an `:Event` node. Events are queryable (`GET /api/v1/events`) and they're the trigger for outbound webhooks — register a webhook for `asset.updated` and you'll get a signed POST every time anyone updates an asset.

There's no soft-delete: `DELETE /assets/{uid}` removes the node, but the `event` recording the deletion stays.

## Identity & idempotency

Connectors typically derive UIDs from a deterministic hash of the source identity (file path, table FQN, ...). That makes re-scans **upsert** rather than create duplicates. The catalog UID is kept stable across scans even when the entity's properties change.

Examples (see each connector's README for the exact recipe):

- `csv-connector` — `sha256("csv:dataset:" + abs_path)[:32]`
- `excel-connector` — `sha256(abs_path + "#" + sheet + "#" + table)[:32]`
- `postgres-connector` — `sha256("postgres:dataset:" + host + ":" + port + "/" + db + "/" + schema + "." + table)[:32]`

## What's NOT modelled (yet)

- **Authentication / RBAC** — the API is open in development; production deployments put a proxy in front.
- **Soft-delete** — deletes are hard; the event log is the recovery path.
- **Per-relation custom properties** — only `:APPLIES_TO` carries fields; others are pure edges.
- **Versioning** — assets don't keep a history of their `metadata` over time; only the last write wins.
- **Saved searches / query templates** — every search is stateless.
