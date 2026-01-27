# ADR-001: Neo4j as Primary Storage

**Date:** 2026-01-27
**Status:** Accepted
**Deciders:** Tom

## Context

Holocron needs to store data assets, actors (people/groups), and their relationships. The core value proposition is **visibility** — understanding what data exists and how it connects.

Key requirements:
- Store entities with flexible metadata
- Track typed relationships between entities
- Query lineage (upstream/downstream traversal)
- Answer "what depends on X?" questions efficiently

## Decision

**Use Neo4j as the primary (and only) database.**

## Options Considered

### 1. PostgreSQL (Relational)
**Pros:**
- Familiar, battle-tested
- Strong ACID guarantees
- Good tooling ecosystem

**Cons:**
- Recursive CTEs for lineage queries are complex and slow
- Schema migrations for new entity types
- JOIN-heavy queries for relationship traversal

### 2. MongoDB (Document)
**Pros:**
- Flexible schema
- Easy to start
- Good for metadata blobs

**Cons:**
- No native graph traversal
- Would need application-level relationship handling
- Lineage queries become complex

### 3. Neo4j (Graph) ✅ Selected
**Pros:**
- Native graph traversal (lineage in one query)
- Cypher is expressive for relationship queries
- Multi-label nodes fit our model perfectly
- Built-in visualization (Neo4j Browser)

**Cons:**
- Less familiar than SQL
- Smaller talent pool
- Overkill if we don't use graph features

### 4. Hybrid (Postgres + Neo4j)
**Pros:**
- Best of both worlds

**Cons:**
- Sync complexity
- Two databases to maintain
- Overkill for MVP

## Rationale

The **core value** of Holocron is understanding relationships:
- "What feeds into this report?"
- "What breaks if I change this dataset?"
- "Who owns the things that depend on X?"

These are **graph traversal queries**. In a relational DB, they require recursive CTEs or multiple round-trips. In Neo4j, they're single Cypher queries:

```cypher
// Find all downstream assets (what depends on X)
MATCH (a:Asset {uid: $uid})-[:FEEDS*1..5]->(downstream)
RETURN downstream

// Find ownership chain
MATCH (a:Asset {uid: $uid})<-[:OWNS]-(owner)
OPTIONAL MATCH (owner)-[:MEMBER_OF]->(group)
RETURN owner, group
```

Given that **relationship traversal is the core feature**, Neo4j is the right tool.

## Consequences

### Positive
- Lineage and impact queries are simple and fast
- Data model maps naturally to graph
- Can visualize relationships in Neo4j Browser
- Cypher is readable for non-engineers

### Negative
- Team needs to learn Cypher
- Fewer hosting options than Postgres
- May need Postgres later for other features (auth, audit logs)

### Mitigations
- Document common Cypher patterns
- Use Neo4j's official Python driver (well-supported)
- Keep the door open for adding Postgres later if needed

## References

- [Neo4j Documentation](https://neo4j.com/docs/)
- [Cypher Query Language](https://neo4j.com/developer/cypher/)
