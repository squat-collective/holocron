# RFC-003: Universal Search

> **Status**: Draft
> **Author**: Tom
> **Created**: 2026-01-29
> **Database**: Neo4j
> **Depends on**: RFC-001 (Glossary), RFC-002 (Hierarchical Assets)

## 📋 Summary

Add **universal full-text search** across all Holocron entities: Assets, Actors, Terms, and Relations.

---

## 🎯 Problem

Currently:
- No search endpoint in the API
- Portal search is client-side filtering only
- Cannot search across entity types
- Cannot find "all things related to revenue"

---

## 👤 User Stories

- *"As a data analyst, I want to search 'revenue' and see all matching terms, assets, and columns."*
- *"As a compliance officer, I want to search 'email' and find all PII-related columns and assets."*
- *"As a new employee, I want to search 'customer' and discover all relevant data assets and definitions."*

---

## 📐 Proposed Design

### Neo4j Full-Text Index

Create a composite full-text index:

```cypher
// Index for searchable text fields
CREATE FULLTEXT INDEX holocron_search FOR (n:Asset|Actor|Term)
ON EACH [n.name, n.description, n.definition]

// Optionally index metadata (if needed)
CREATE FULLTEXT INDEX holocron_search_extended FOR (n:Asset|Actor|Term)
ON EACH [n.name, n.description, n.definition, n.metadata_text]
```

### Search API

```
GET /api/v1/search?q=<query>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `types` | string[] | Filter by entity type: `asset`, `actor`, `term` |
| `asset_types` | string[] | Filter assets by type: `dataset`, `column`, etc. |
| `domains` | string[] | Filter terms by domain |
| `pii` | boolean | Filter for PII-related items |
| `status` | string | Filter by status |
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset |

#### Examples

```
# Basic search
GET /api/v1/search?q=revenue

# Search only columns
GET /api/v1/search?q=email&types=asset&asset_types=column

# Search with PII filter
GET /api/v1/search?q=customer&pii=true

# Search terms in Finance domain
GET /api/v1/search?q=sales&types=term&domains=Finance

# Fuzzy search (typo tolerance)
GET /api/v1/search?q=revnue~

# Phrase search
GET /api/v1/search?q="active customer"
```

### Response Format

```typescript
interface SearchResponse {
  query: string;
  total: number;
  limit: number;
  offset: number;

  items: SearchResult[];

  // Aggregations for filtering UI
  facets: {
    entity_type: Record<string, number>;   // { "asset": 10, "term": 3 }
    asset_type?: Record<string, number>;   // { "column": 8, "dataset": 2 }
    domain?: Record<string, number>;       // { "Finance": 5, "Sales": 3 }
    pii: Record<string, number>;           // { "true": 2, "false": 13 }
  };
}

interface SearchResult {
  // Identity
  entity_type: "asset" | "actor" | "term";
  uid: string;

  // Display
  name: string;
  description?: string;

  // Type info
  asset_type?: string;    // For assets: "dataset", "column", etc.
  actor_type?: string;    // For actors: "person", "group"
  domain?: string;        // For terms

  // Match info
  score: number;          // Relevance score (0-1)
  match_field: string;    // Which field matched: "name", "description"
  match_snippet?: string; // Highlighted snippet: "total **revenue** from..."

  // Context (for nested items)
  parent?: {
    uid: string;
    name: string;
    type: string;
  };

  // Governance
  pii?: boolean;
  status?: string;
}
```

### Example Response

```json
{
  "query": "revenue",
  "total": 15,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "entity_type": "term",
      "uid": "term-001",
      "name": "Revenue",
      "description": "Total income from sales",
      "domain": "Finance",
      "score": 0.98,
      "match_field": "name",
      "match_snippet": "**Revenue** - Total income from sales"
    },
    {
      "entity_type": "asset",
      "uid": "col-123",
      "name": "total_revenue",
      "asset_type": "column",
      "score": 0.85,
      "match_field": "name",
      "match_snippet": "total_**revenue**",
      "parent": {
        "uid": "table-456",
        "name": "sales_summary",
        "type": "table"
      }
    },
    {
      "entity_type": "asset",
      "uid": "report-789",
      "name": "Monthly Revenue Report",
      "asset_type": "report",
      "score": 0.75,
      "match_field": "name",
      "match_snippet": "Monthly **Revenue** Report"
    }
  ],
  "facets": {
    "entity_type": { "asset": 12, "term": 2, "actor": 1 },
    "asset_type": { "column": 8, "report": 3, "measure": 1 },
    "domain": { "Finance": 2 },
    "pii": { "false": 14, "true": 1 }
  }
}
```

### Neo4j Implementation

```cypher
// Basic full-text search
CALL db.index.fulltext.queryNodes('holocron_search', $query)
YIELD node, score
WHERE score > 0.3
WITH node, score

// Add parent context for nested assets
OPTIONAL MATCH (parent)-[:CONTAINS]->(node)

// Apply filters
WHERE ($types IS NULL OR labels(node)[0] IN $types)
  AND ($pii IS NULL OR node.pii = $pii)

// Return with facets
RETURN
  labels(node)[0] as entity_type,
  node.uid as uid,
  node.name as name,
  node.description as description,
  node.type as asset_type,
  score,
  parent.uid as parent_uid,
  parent.name as parent_name

ORDER BY score DESC
LIMIT $limit
```

---

## 🖥️ Portal UI

### Global Search Bar

- Always visible in header
- Keyboard shortcut: `Cmd/Ctrl + K`
- Shows instant results as you type
- Recent searches

### Search Results Page (`/search?q=...`)

- Faceted filtering sidebar
- Result cards with type icons
- Highlighted matches
- Click to navigate to detail page

### Quick Actions

From search results:
- View details
- Edit (if permitted)
- Copy UID
- View lineage

---

## ✅ Acceptance Criteria

- [ ] Full-text index created in Neo4j
- [ ] `GET /api/v1/search` endpoint implemented
- [ ] Supports filtering by entity type, asset type, domain, PII
- [ ] Returns facets for filter counts
- [ ] Supports fuzzy matching (typo tolerance)
- [ ] Returns parent context for nested assets
- [ ] Portal has global search bar
- [ ] Portal has search results page with facets

---

## ❓ Open Questions

1. **Synonym expansion**: Should searching "Revenue" also find "Income" if they're synonyms?
2. **Boosting**: Should term matches rank higher than asset matches?
3. **Recent/popular**: Should we track and surface frequently accessed items?
4. **Permissions**: Should search respect access permissions (if added later)?
