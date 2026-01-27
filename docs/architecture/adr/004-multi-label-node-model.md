# ADR-004: Multi-Label Node Model in Neo4j

**Date:** 2026-01-27
**Status:** Accepted
**Deciders:** Tom

## Context

Holocron tracks different types of entities:
- **Assets:** Dataset, Report, Process, System
- **Actors:** Person, Group

We need to decide how to model these types in Neo4j.

## Decision

**Use multiple labels per node: a base label + type-specific label.**

```cypher
// Assets have :Asset + specific type
(:Asset:Dataset {uid: "...", name: "..."})
(:Asset:Report {uid: "...", name: "..."})
(:Asset:Process {uid: "...", name: "..."})
(:Asset:System {uid: "...", name: "..."})

// Actors have :Actor + specific type
(:Actor:Person {uid: "...", name: "..."})
(:Actor:Group {uid: "...", name: "..."})
```

## Options Considered

### 1. Single Label + Type Property
```cypher
(:Asset {type: "dataset", ...})
(:Asset {type: "report", ...})
```

**Pros:**
- Simple queries: `MATCH (a:Asset)`
- Easy to add new types (no schema change)

**Cons:**
- Can't use label-specific indexes
- Queries for specific type: `WHERE a.type = 'dataset'` (slower)
- No Neo4j-level type enforcement

### 2. Separate Labels Only
```cypher
(:Dataset {...})
(:Report {...})
(:Person {...})
```

**Pros:**
- Clean separation
- Type-specific indexes

**Cons:**
- Hard to query "all assets" without UNION
- No shared base for common operations
- Relationships must list all types

### 3. Multiple Labels ✅ Selected
```cypher
(:Asset:Dataset {...})
(:Asset:Report {...})
```

**Pros:**
- Query all assets: `MATCH (a:Asset)`
- Query specific type: `MATCH (d:Dataset)`
- Label-specific indexes work
- Neo4j-native pattern

**Cons:**
- Must remember to add both labels
- Slightly more complex node creation

## Rationale

This is **Neo4j's recommended pattern** for type hierarchies. It gives us:

### 1. Flexible Querying
```cypher
// All assets
MATCH (a:Asset) RETURN a

// Only datasets
MATCH (d:Dataset) RETURN d

// Assets owned by someone
MATCH (p:Person)-[:OWNS]->(a:Asset) RETURN a
```

### 2. Efficient Indexing
```cypher
// Index on all assets
CREATE INDEX FOR (a:Asset) ON (a.name)

// Index on datasets only
CREATE INDEX FOR (d:Dataset) ON (d.location)
```

### 3. Type Safety in Relationships
```cypher
// Only Actors can own Assets (enforced by query pattern)
MATCH (actor:Actor)-[:OWNS]->(asset:Asset)
```

### 4. Easy Extension
Adding a new type is just a new label combination:
```cypher
// New asset type
CREATE (:Asset:Pipeline {name: "ETL Job"})
```

## Implementation

### Creating Nodes
```python
# In repository
async def create_asset(self, asset: Asset) -> Asset:
    labels = f":Asset:{asset.type.value}"  # e.g., ":Asset:Dataset"
    query = f"""
        CREATE (a{labels} $props)
        RETURN a
    """
    ...
```

### Constraints & Indexes
```cypher
// Unique UID across all assets
CREATE CONSTRAINT asset_uid FOR (a:Asset) REQUIRE a.uid IS UNIQUE;

// Unique UID across all actors
CREATE CONSTRAINT actor_uid FOR (a:Actor) REQUIRE a.uid IS UNIQUE;

// Search indexes
CREATE INDEX asset_name FOR (a:Asset) ON (a.name);
CREATE INDEX dataset_location FOR (d:Dataset) ON (d.location);
```

## Consequences

### Positive
- Idiomatic Neo4j usage
- Efficient queries at both levels
- Easy to extend with new types
- Clear data model

### Negative
- Must ensure both labels are set on creation
- Queries must use correct label for intent

### Mitigations
- Repository layer enforces label assignment
- Type enums in Python ensure valid types
- Integration tests verify label correctness

## References

- [Neo4j: Labels Best Practices](https://neo4j.com/developer/guide-data-modeling/)
- [Neo4j: Multiple Labels](https://neo4j.com/docs/cypher-manual/current/clauses/create/#create-create-a-node-with-multiple-labels)
