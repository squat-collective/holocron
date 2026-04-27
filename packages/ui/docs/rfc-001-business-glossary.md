# RFC-001: Business Glossary (Terms)

> **Status**: Draft
> **Author**: Tom
> **Created**: 2026-01-29
> **Database**: Neo4j

## 📋 Summary

Add a **Business Glossary** to Holocron - a collection of standardized business term definitions that provide a common vocabulary across the organization.

---

## 🎯 Problem

Without a glossary:
- Different teams use different names for the same concept ("Revenue" vs "Sales" vs "Income")
- No single source of truth for what a metric means
- New team members struggle to understand business terminology
- Reports may calculate the same metric differently

---

## 👤 User Stories

- *"As a data analyst, I want to look up the official definition of 'Active Customer' so I use it correctly."*
- *"As a data steward, I want to define and maintain business terms for my domain."*
- *"As a report builder, I want to link my columns to official terms so users understand what they're seeing."*

---

## 📐 Proposed Design

### Term Entity

A new Neo4j node type: `Term`

```typescript
interface Term {
  uid: string;

  // Core
  name: string;              // "Revenue", "Active Customer", "Churn Rate"
  definition: string;        // Clear, human-readable explanation

  // Classification
  domain: string;            // "Finance", "Sales", "Marketing", "Operations"
  status: "draft" | "approved" | "deprecated";

  // Technical (optional)
  formula?: string;          // "SUM(order_items.quantity * order_items.unit_price)"
  unit?: string;             // "USD", "count", "percentage", "days"

  // Governance
  pii: boolean;              // Does this term relate to personal data?
  sensitivity: "public" | "internal" | "confidential" | "restricted";

  // Flexible
  metadata: Record<string, unknown>;

  // Timestamps
  created_at: string;
  updated_at: string;
}
```

### Relations

```cypher
// Actor stewards (is responsible for) a Term
(Actor)-[:STEWARDS]->(Term)

// Term defines what an Asset/Column represents
(Term)-[:DEFINES]->(Asset)

// Terms can be related to each other
(Term)-[:RELATED_TO]->(Term)

// Terms can be synonyms
(Term)-[:SYNONYM_OF]->(Term)
```

### API Endpoints

```
# CRUD
GET    /api/v1/terms                    # List terms (filter by domain, status)
POST   /api/v1/terms                    # Create term
GET    /api/v1/terms/:uid               # Get term
PUT    /api/v1/terms/:uid               # Update term
DELETE /api/v1/terms/:uid               # Delete term

# Relations
GET    /api/v1/terms/:uid/assets        # Get assets defined by this term
POST   /api/v1/terms/:uid/defines/:asset_uid    # Link term to asset
DELETE /api/v1/terms/:uid/defines/:asset_uid    # Unlink

GET    /api/v1/terms/:uid/related       # Get related terms
POST   /api/v1/terms/:uid/related/:term_uid     # Link terms
DELETE /api/v1/terms/:uid/related/:term_uid     # Unlink

GET    /api/v1/terms/:uid/synonyms      # Get synonyms
POST   /api/v1/terms/:uid/synonyms/:term_uid    # Add synonym
DELETE /api/v1/terms/:uid/synonyms/:term_uid    # Remove synonym
```

### Example Terms

| Name | Domain | Definition | Formula | Unit |
|------|--------|------------|---------|------|
| Revenue | Finance | Total income from sales before deductions | `SUM(quantity × price)` | USD |
| Active Customer | Sales | Customer with at least one order in the last 90 days | `COUNT(DISTINCT customer_id) WHERE last_order > NOW() - 90 days` | count |
| Churn Rate | Marketing | Percentage of customers who stopped using the service | `(lost_customers / start_customers) × 100` | % |
| NPS | Customer | Net Promoter Score measuring customer satisfaction | `%promoters - %detractors` | score |

---

## 🖥️ Portal UI

### Glossary List Page (`/glossary`)
- Search/filter terms by domain, status
- Show term cards with name, domain, definition preview
- Quick actions: view, edit, link to assets

### Term Detail Page (`/glossary/:uid`)
- Full definition and formula
- Steward information
- Linked assets (which columns/reports use this term)
- Related terms and synonyms

### Term in Asset Detail
- When viewing an asset, show linked terms
- "This column represents: [Revenue]" with link to definition

---

## 🔗 Graph Model

```
┌─────────────┐
│    Actor    │
│   (Tom)     │
└──────┬──────┘
       │ stewards
       ▼
┌─────────────┐     related_to    ┌─────────────┐
│    Term     │◄─────────────────►│    Term     │
│  (Revenue)  │                   │(Gross Sales)│
└──────┬──────┘                   └─────────────┘
       │ defines
       ▼
┌─────────────┐
│   Asset     │
│(sales.total)│
└─────────────┘
```

---

## ✅ Acceptance Criteria

- [ ] Can create, read, update, delete Terms
- [ ] Can assign a steward (Actor) to a Term
- [ ] Can link Terms to Assets
- [ ] Can define related terms and synonyms
- [ ] Can filter/search terms by domain, status, steward
- [ ] Portal shows glossary list and detail pages
- [ ] Asset detail shows linked terms

---

## ❓ Open Questions

1. Should terms have an approval workflow (draft → review → approved)?
2. Should we track term definition history/versions?
3. Should domains be a fixed enum or free-form text?
