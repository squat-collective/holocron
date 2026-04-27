# ADD-001: Product Vision 🌌

> Architecture Design Document

**Status**: Draft
**Created**: 2026-01-28
**Author**: Tom & Claude

---

## 1. Vision Statement

> **"Anyone in the organization can find, understand, and trust their data."**

Holocron Portal is a data documentation platform that makes data **accessible to everyone** — not just data engineers. It's the single source of truth for "Where is our data?" and "What does it mean?"

---

## 2. Problem Statement

### The Pain

| User | Problem |
|------|---------|
| Business User | "Where can I find official sales numbers?" |
| Analyst | "What does this column actually mean?" |
| Manager | "Who owns this report? Is it still maintained?" |
| Engineer | "What will break if I change this table?" |

### The Solution

A **search-first data catalog** where anyone can:
- 🔍 **Find** data assets instantly
- 📖 **Understand** what data means with rich context
- 🔗 **Trace** where data comes from and flows to
- 👥 **Know** who owns and uses each asset

---

## 3. Target Users

### Primary: Non-Technical Users
- Business analysts
- Product managers
- Marketing/Sales teams
- Executives

**Key insight**: These users don't care about technical details. They want answers:
- "Where is the official X?"
- "What does Y mean?"
- "Who can help me with Z?"

### Secondary: Data Team
- Data Engineers
- Data Analysts
- Data Stewards/Governance

**Their needs**: Documentation, lineage, ownership tracking

---

## 4. Core User Journeys

### Journey 1: Find Data (Search)
```
User: Types "sales revenue"
       ↓
Portal: Shows matching assets (datasets, reports)
       ↓
User: Clicks on "Monthly Sales Report"
       ↓
Portal: Shows description, owner, data source, freshness
       ↓
User: "Ah, this is what I need! And I can ask Sarah about it."
```

### Journey 2: Understand Data (Context)
```
User: Opens a dataset
       ↓
Portal: Shows:
        - Plain English description
        - Business glossary terms
        - Data quality indicators
        - Custom metadata fields
       ↓
User: Understands what the data means and can trust it
```

### Journey 3: Trace Data (Lineage)
```
User: "Where does this number come from?"
       ↓
Portal: Shows upstream sources (simple list)
        - Raw data → Transformed table → This report
       ↓
User: Understands the data pipeline
```

### Journey 4: Find Owner (Actors)
```
User: "Who can help me with this data?"
       ↓
Portal: Shows:
        - Owner: Sarah (Data Steward)
        - Consumers: Marketing Team, Finance Team
       ↓
User: Knows who to contact
```

---

## 5. Feature Set

### MVP Features (Full Catalog)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Global Search** | Google-like search across all assets | P0 |
| **Asset Catalog** | Browse/view all data assets | P0 |
| **Asset Details** | Rich documentation page per asset | P0 |
| **Actor Directory** | People and teams who own/use data | P0 |
| **Simple Lineage** | Upstream/downstream as lists | P1 |
| **Metadata Display** | Standard + custom fields | P0 |
| **Business Glossary** | Link assets to business terms | P1 |
| **Data Quality** | Freshness, completeness indicators | P1 |

### Collaboration Model

| Role | Permissions |
|------|-------------|
| **Everyone** | View all assets, search, browse |
| **Owner/Steward** | Edit asset documentation |
| **Admin** | Manage actors, bulk operations |

*Note: No authentication for MVP. Access control is future work.*

### Not in MVP
- ❌ Authentication/SSO
- ❌ Interactive lineage graph
- ❌ Data profiling/statistics
- ❌ Change requests/approval workflows
- ❌ Notifications/subscriptions

---

## 6. Information Architecture

### Asset Types
| Type | Description | Example |
|------|-------------|---------|
| `dataset` | Tables, files, data sources | `sales_transactions` |
| `report` | Dashboards, visualizations | `Monthly Revenue Dashboard` |
| `process` | ETL jobs, pipelines | `daily_sales_etl` |
| `system` | Applications, databases | `Salesforce`, `PostgreSQL` |

### Asset Metadata

#### Standard Fields
- **Name** - Human-readable title
- **Description** - Plain English explanation
- **Owner** - Primary responsible person/team
- **Status** - active, deprecated, draft
- **Tags** - Searchable labels
- **Location** - Where to access (URL, path)

#### Business Glossary
- Link to business terms/definitions
- "Revenue" → Definition, calculation method

#### Data Quality Indicators
- **Freshness** - Last updated timestamp
- **Completeness** - % of non-null values (if available)
- **Quality Score** - Overall health indicator

#### Custom Fields
- User-defined key-value pairs
- `department: Finance`
- `pii_contains: true`
- `refresh_frequency: daily`

### Relation Types
| Relation | Meaning |
|----------|---------|
| `owns` | Actor is responsible for Asset |
| `uses` | Actor consumes Asset |
| `feeds` | Asset A provides data to Asset B |
| `derived_from` | Asset A is created from Asset B |
| `contains` | Asset A includes Asset B |
| `produces` | Process creates Asset |
| `consumes` | Process reads from Asset |

---

## 7. UX Principles

### 1. Search-First
- Search bar is the hero element
- Results appear instantly (as you type)
- Smart ranking: relevance + popularity

### 2. Plain Language
- No jargon in UI
- "Data Source" not "Upstream Dependency"
- "Owner" not "Data Steward"

### 3. Progressive Disclosure
- Show essentials first
- Technical details on demand
- Don't overwhelm non-tech users

### 4. Trust Signals
- Show freshness prominently
- Quality indicators visible
- Clear ownership

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Time to find data | < 30 seconds |
| Search success rate | > 80% find what they need |
| Documentation coverage | > 90% assets have descriptions |
| User adoption | Used by non-data teams |

---

## 9. Technical Constraints

From `CLAUDE.md`:
- Next.js 15 (App Router)
- TypeScript strict mode
- holocron-ts SDK (never call API directly)
- Containerized development
- TDD approach

---

## 10. Open Questions

- [ ] How to handle very large catalogs (1000s of assets)?
- [ ] Should we support asset favorites/bookmarks?
- [ ] How to surface "popular" or "recommended" assets?
- [ ] Integration with Slack/Teams for notifications (future)?

---

## References

- [Journal: SDK Research](../../journal/2026-01-28-sdk-research.md)
- [holocron-ts SDK](https://github.com/squat-collective/holocron-ts)
