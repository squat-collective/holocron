# RFC-002: Hierarchical Assets (Schema as Assets)

> **Status**: Draft
> **Author**: Tom
> **Created**: 2026-01-29
> **Database**: Neo4j

## 📋 Summary

Extend the Asset model to support **hierarchical structures** where tables, columns, sheets, and pages are themselves Assets linked by a `contains` relationship.

---

## 🎯 Problem

Currently:
- Schema (columns, tables) is stored as JSON in `metadata.schema`
- Cannot search for columns across assets
- Cannot create column-level lineage
- Cannot link glossary terms to specific columns

---

## 👤 User Stories

- *"As a data engineer, I want to find all columns named 'email' across all datasets to audit PII."*
- *"As a report builder, I want to document that my 'Total Revenue' measure comes from the 'orders.amount' column."*
- *"As a data steward, I want to link the 'Revenue' glossary term to the specific column that is the source of truth."*

---

## 📐 Proposed Design

### Key Insight: Columns ARE Assets

Instead of a new entity type, we extend `AssetType`:

```typescript
type AssetType =
  // Existing top-level types
  | "dataset"
  | "report"
  | "process"
  | "system"

  // Database objects
  | "schema"        // Database schema (namespace)
  | "table"
  | "view"
  | "column"

  // Report elements
  | "sheet"         // Excel sheet
  | "page"          // Report page
  | "visual"        // Dashboard visual/chart

  // BI elements
  | "measure"       // Calculated measure
  | "dimension"     // Dimension field
  | "model"         // Data model

  // API elements
  | "endpoint"      // API endpoint
  | "field";        // API field
```

### `contains` Relation

A new relation type for parent-child hierarchy:

```cypher
(Dataset)-[:CONTAINS]->(Table)-[:CONTAINS]->(Column)
(Report)-[:CONTAINS]->(Sheet)-[:CONTAINS]->(Visual)
(System)-[:CONTAINS]->(Endpoint)-[:CONTAINS]->(Field)
```

### Type-Specific Metadata

Each asset type can have specific metadata:

```typescript
// Column
interface ColumnMetadata {
  data_type: "string" | "integer" | "float" | "boolean" | "date" | "datetime" | "array" | "object";
  nullable?: boolean;
  primary_key?: boolean;
  foreign_key?: string;  // Reference to another column UID
  default_value?: string;
  pii?: boolean;
}

// Table
interface TableMetadata {
  schema_name?: string;
  row_count?: number;
  size_bytes?: number;
}

// Measure
interface MeasureMetadata {
  formula: string;
  aggregation?: "sum" | "avg" | "count" | "min" | "max" | "distinct_count";
  format?: string;
}

// Endpoint
interface EndpointMetadata {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  authentication?: string;
}
```

### API Changes

#### Get Asset with Children

```
GET /api/v1/assets/:uid?include=children
GET /api/v1/assets/:uid?include=children&depth=3
```

Response:
```json
{
  "uid": "dataset-123",
  "type": "dataset",
  "name": "Sales Database",
  "children": [
    {
      "uid": "table-456",
      "type": "table",
      "name": "orders",
      "metadata": { "row_count": 50000 },
      "children": [
        {
          "uid": "col-001",
          "type": "column",
          "name": "order_id",
          "metadata": { "data_type": "integer", "primary_key": true }
        },
        {
          "uid": "col-002",
          "type": "column",
          "name": "customer_email",
          "metadata": { "data_type": "string", "pii": true }
        }
      ]
    }
  ]
}
```

#### Create Child Asset

```
POST /api/v1/assets/:parent_uid/children
{
  "type": "column",
  "name": "revenue",
  "metadata": { "data_type": "float" }
}
```

#### Bulk Create Schema

```
POST /api/v1/assets/:uid/schema
{
  "replace": true,  // Replace existing children or merge
  "children": [
    {
      "type": "table",
      "name": "orders",
      "children": [
        { "type": "column", "name": "order_id", "metadata": { "data_type": "integer" } },
        { "type": "column", "name": "amount", "metadata": { "data_type": "float" } }
      ]
    },
    {
      "type": "table",
      "name": "customers",
      "children": [
        { "type": "column", "name": "customer_id", "metadata": { "data_type": "integer" } },
        { "type": "column", "name": "email", "metadata": { "data_type": "string", "pii": true } }
      ]
    }
  ]
}
```

#### List Assets with Filters

```
GET /api/v1/assets?type=column&pii=true
GET /api/v1/assets?type=column&name=email
GET /api/v1/assets?type=column&parent_type=dataset
```

### Column-Level Lineage

Existing relations work at column level:

```cypher
// Report column derived from database column
(report_column)-[:DERIVED_FROM]->(db_column)

// Measure depends on multiple columns
(measure)-[:DEPENDS_ON]->(column1)
(measure)-[:DEPENDS_ON]->(column2)
```

---

## 🔗 Graph Model

```
┌─────────────┐
│   Dataset   │
│ (sales_db)  │
└──────┬──────┘
       │ contains
       ▼
┌─────────────┐     ┌─────────────┐
│    Table    │     │    Table    │
│  (orders)   │     │ (customers) │
└──────┬──────┘     └──────┬──────┘
       │ contains          │ contains
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Column    │     │   Column    │
│  (amount)   │     │   (email)   │
└──────┬──────┘     └─────────────┘
       │ derived_from
       ▼
┌─────────────┐
│   Measure   │ (in a Report)
│ (Revenue)   │
└─────────────┘
```

---

## ✅ Acceptance Criteria

- [ ] New asset types added (table, column, sheet, etc.)
- [ ] `contains` relation type added
- [ ] API supports `?include=children` parameter
- [ ] API supports `POST /assets/:uid/children`
- [ ] API supports `POST /assets/:uid/schema` for bulk operations
- [ ] Can filter assets by `parent_uid` or `parent_type`
- [ ] Relations (derived_from, depends_on) work between columns
- [ ] Portal schema editor uses API instead of metadata

---

## ❓ Open Questions

1. **Deletion cascade**: When deleting a table, delete all columns too?
2. **Move operations**: Can a column be moved to a different table?
3. **Import from source**: Should Holocron connect to databases to auto-import schemas?
4. **Change tracking**: Should we track when columns are added/removed/modified?
