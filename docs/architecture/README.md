# Architecture 🏛️

> Technical decisions, research, and design documentation for Holocron.

## Purpose

This folder is the **engineering knowledge base** — capturing how and why we build things the way we do.

## Structure

```
architecture/
├── README.md
├── adr/              # Architecture Decision Records
├── research/         # Exploration sessions and spikes
└── specs/            # Detailed design specifications
```

## Document Types

### 📋 ADRs (Architecture Decision Records)
Key technical decisions with context, options considered, and rationale.

**Format:** `adr/NNN-short-title.md`
**Example:** `adr/001-neo4j-as-primary-store.md`

### 🔬 Research Notes
Exploration sessions, tool comparisons, and technical spikes.

**Format:** `research/YYYY-MM-DD-topic.md`
**Example:** `research/2026-01-27-graph-db-comparison.md`

### 📐 Design Specs
Detailed technical designs before implementation.

**Format:** `specs/feature-name.md`
**Example:** `specs/reader-plugin-system.md`

## Guidelines

- **Capture context** — Future readers need the "why", not just the "what"
- **Link freely** — Reference between docs, code, and issues
- **Update when needed** — Specs evolve; supersede ADRs rather than editing

---

*"Architecture is the art of how to waste space."* — Philip Johnson
*"...and how to organize knowledge."* — Holocron
