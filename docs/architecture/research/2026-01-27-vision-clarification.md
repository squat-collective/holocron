# Vision Clarification 🎯

> Research session: Defining Holocron's core purpose and scope.

**Date:** 2026-01-27
**Status:** ✅ Validated

---

## The Problem

> "We don't know what data we have, where it comes from, who owns it, who uses it, or why it exists."

### Symptoms
- Data is scattered across systems (DBs, files, emails, spreadsheets)
- No lineage visibility — can't trace source → output
- Documentation is stale or non-existent
- Tribal knowledge — only certain people know things
- Unknown ownership and maintenance responsibility
- Unknown consumers and usage patterns

### Context
- **Environment:** Company with messy data landscape
- **Reality:** Excel files, email-based data, legacy systems, manual processes
- **Scale:** Unknown (that's part of the problem!)
- **Current state:** No formal documentation

### Why Existing Tools Don't Fit
Modern data catalogs (DataHub, Atlan, etc.) assume:
- Cloud-native architecture
- Clean databases with schemas
- Automated pipelines (Airflow, dbt)
- APIs with introspectable metadata

Our reality is messier — spreadsheets everywhere, email attachments, legacy systems.

---

## The Solution

**Holocron = Visibility tool for data assets**

A map of what exists, where it lives, who owns it, who uses it, and how it connects.

### Primary Goal
**VISIBILITY** — just know what data exists, where, and who owns it.

*Not* (yet): automated discovery, data quality, compliance, access control.

---

## Core Concepts

### Entities

| Type | Description | Examples |
|------|-------------|----------|
| **Dataset** | Actual data containers | Tables, Excel files, CSVs, JSON files |
| **Report** | Outputs that consume data | Dashboards, PDF reports, Excel reports |
| **Process** | Transformations and jobs | ETL scripts, SQL transforms, cron jobs |
| **System** | Hosts for data | Databases, applications, file servers |
| **Person** | Individual actors | Data owners, analysts, engineers |
| **Group** | Team/organizational unit | Finance team, Data team |

### Relationships (Typed)

| Relation | From → To | Meaning |
|----------|-----------|---------|
| `owns` | Person/Group → Asset | Responsible for this asset |
| `uses` | Person/Group → Asset | Consumes this asset |
| `feeds` | Asset → Asset | Data flows from A to B |
| `contains` | System → Asset | Asset lives in this system |
| `runs` | System → Process | Process executes on this system |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         HOLOCRON                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐     ┌──────────┐     ┌──────────────────────┐   │
│   │  Web UI  │────▶│ REST API │────▶│   Neo4j (Graph DB)   │   │
│   └──────────┘     └──────────┘     └──────────────────────┘   │
│                          ▲                                      │
│                          │                                      │
│   ┌──────────────────────┴───────────────────────┐             │
│   │                  READERS                      │             │
│   │  (Plugins that suggest metadata from sources) │             │
│   └──────────────────────────────────────────────┘             │
│         │              │              │                         │
│         ▼              ▼              ▼                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│   │  Excel   │  │ Postgres │  │  Files   │  ...                │
│   └──────────┘  └──────────┘  └──────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flow

1. **Declare** — Users describe assets via Web UI (backed by API)
2. **Assist** — Readers scan sources and *suggest* metadata
3. **Review** — Humans review and approve suggestions (human stays in control!)
4. **Store** — Approved assets go into Neo4j with typed relationships
5. **Query** — Answer questions like:
   - "What depends on this Excel file?"
   - "Who owns the sales report?"
   - "Where does this data come from?"

### First Reader: Excel
Scans `.xlsx` files and suggests:
- Sheet names as potential datasets
- Column names and types
- Potential relationships (if sheet names match)

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | Neo4j | Traversing relationships is core value |
| Interface | API-first + Web UI | API enables CLI, SDK, MCP later |
| Data entry | Declarative + Readers | Humans control, readers assist |
| Reader output | Suggestions | Not auto-populate — human approval required |

---

## What Holocron is NOT (Scope Boundaries)

- ❌ Not a data quality tool
- ❌ Not an access control system
- ❌ Not a data pipeline orchestrator
- ❌ Not a BI/visualization tool
- ❌ Not trying to auto-discover everything

---

## Open Questions (For Future Sessions)

1. How to handle versioning of assets over time?
2. What's the schema for suggestions (reader → human)?
3. How to handle "draft" vs "published" assets?
4. Search and discovery UX patterns?

---

*"A Holocron is a repository of knowledge, containing ancient wisdom and guiding those who seek it."*
