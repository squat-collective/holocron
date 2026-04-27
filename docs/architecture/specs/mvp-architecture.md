# MVP Architecture 🏗️

> Technical architecture for Holocron MVP.

**Date:** 2026-01-27
**Status:** ⚠️ **Superseded** by [`current-architecture.md`](current-architecture.md) (2026-04-26).
This page is preserved as historical context; significant parts (the reader/scan API, the `:DERIVED_FROM` / `:PRODUCES` / `:CONSUMES` edges, the no-UI / no-search scope) no longer reflect the system. See the "What changed since the MVP spec" section of the current spec for a diff.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOLOCRON                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   REST API (FastAPI)                     │   │
│  │                     /api/v1/...                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│           ┌────────────────┼────────────────┐                  │
│           ▼                ▼                ▼                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │    Core     │  │   Reader    │  │   Neo4j Driver      │    │
│  │  Services   │  │   System    │  │   (Repositories)    │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
│                            │                │                   │
│                            └────────────────┘                   │
│                                    │                            │
└────────────────────────────────────│────────────────────────────┘
                                     ▼
                        ┌─────────────────────┐
                        │   Neo4j Database    │
                        │   (Docker/Podman)   │
                        └─────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **API** | FastAPI | Async, auto docs, Pydantic integration |
| **Validation** | Pydantic v2 | Type-safe request/response models |
| **Database** | Neo4j | Graph traversal is core value |
| **Driver** | neo4j-python | Official async driver |
| **Container** | Docker/Podman | Consistent deployment |
| **Package mgmt** | uv | Fast, modern Python tooling |
| **Testing** | pytest | Standard, well-supported |

---

## Project Structure

```
holocron/
├── src/holocron/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app entrypoint
│   ├── config.py               # Settings (Pydantic BaseSettings)
│   │
│   ├── api/                    # REST API layer
│   │   ├── __init__.py
│   │   ├── dependencies.py     # Shared dependencies (DB session, etc.)
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── assets.py       # /api/v1/assets
│   │   │   ├── actors.py       # /api/v1/actors
│   │   │   ├── relations.py    # /api/v1/relations
│   │   │   ├── readers.py      # /api/v1/readers
│   │   │   └── health.py       # /api/v1/health
│   │   └── schemas/            # Pydantic models for API
│   │       ├── __init__.py
│   │       ├── assets.py
│   │       ├── actors.py
│   │       ├── relations.py
│   │       └── common.py       # Shared schemas (pagination, etc.)
│   │
│   ├── core/                   # Business/domain logic
│   │   ├── __init__.py
│   │   ├── models.py           # Domain models (Asset, Actor, Relation)
│   │   ├── exceptions.py       # Custom exceptions
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── asset_service.py
│   │       ├── actor_service.py
│   │       └── relation_service.py
│   │
│   ├── db/                     # Database layer (Neo4j)
│   │   ├── __init__.py
│   │   ├── connection.py       # Neo4j driver setup
│   │   └── repositories/
│   │       ├── __init__.py
│   │       ├── base.py         # Base repository
│   │       ├── asset_repo.py
│   │       ├── actor_repo.py
│   │       └── relation_repo.py
│   │
│   └── readers/                # Reader plugin system
│       ├── __init__.py
│       ├── base.py             # Abstract base reader class
│       ├── registry.py         # Discover & load readers
│       └── models.py           # Suggestion models
│
├── plugins/                    # Custom readers (loaded at runtime)
│   └── .gitkeep
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Fixtures
│   ├── unit/
│   └── integration/
│
├── docs/
│   └── architecture/
│
├── Makefile                    # All commands
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
└── .env.example
```

---

## Neo4j Data Model

### Node Labels

```
:Asset (base label for all data assets)
├── :Asset:Dataset     # Tables, files, spreadsheets
├── :Asset:Report      # Dashboards, reports
├── :Asset:Process     # ETL jobs, scripts
└── :Asset:System      # Databases, applications

:Actor (base label for people/teams)
├── :Actor:Person      # Individual people
└── :Actor:Group       # Teams, departments
```

### Core Properties

```cypher
// Assets
(:Asset {
  uid: "uuid-string",        // Primary identifier
  name: "string",            // Display name (required)
  description: "string",     // What is this asset?
  location: "string",        // Where to find it (path, URL, etc.)
  status: "string",          // active | deprecated | draft
  created_at: datetime,
  updated_at: datetime,
  metadata: "json-string"    // Custom fields as JSON
})

// Actors
(:Actor {
  uid: "uuid-string",
  name: "string",
  email: "string",           // Optional, for Person
  metadata: "json-string"
})
```

### Relationships

```cypher
// Ownership & Usage
(:Actor)-[:OWNS {since: datetime}]->(:Asset)
(:Actor)-[:USES {purpose: "string"}]->(:Asset)

// Data Lineage
(:Asset)-[:FEEDS]->(:Asset)              // Data flows A → B
(:Asset)-[:DERIVED_FROM]->(:Asset)       // B created from A

// Containment & Production
(:Asset:System)-[:CONTAINS]->(:Asset)
(:Asset:Process)-[:PRODUCES]->(:Asset)
(:Asset:Process)-[:CONSUMES]->(:Asset)

// Actor Grouping
(:Actor:Person)-[:MEMBER_OF]->(:Actor:Group)
```

### Indexes

```cypher
// Unique constraints
CREATE CONSTRAINT asset_uid IF NOT EXISTS FOR (a:Asset) REQUIRE a.uid IS UNIQUE;
CREATE CONSTRAINT actor_uid IF NOT EXISTS FOR (a:Actor) REQUIRE a.uid IS UNIQUE;

// Search indexes
CREATE INDEX asset_name IF NOT EXISTS FOR (a:Asset) ON (a.name);
CREATE INDEX actor_name IF NOT EXISTS FOR (a:Actor) ON (a.name);
CREATE INDEX asset_status IF NOT EXISTS FOR (a:Asset) ON (a.status);
```

---

## REST API

Base path: `/api/v1`

### Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assets` | List assets (filterable by type, status) |
| GET | `/assets/{uid}` | Get single asset |
| POST | `/assets` | Create new asset |
| PUT | `/assets/{uid}` | Update asset |
| DELETE | `/assets/{uid}` | Delete asset |
| GET | `/assets/{uid}/lineage` | Get upstream/downstream |

### Actors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/actors` | List actors (filterable by type) |
| GET | `/actors/{uid}` | Get single actor |
| POST | `/actors` | Create new actor |
| PUT | `/actors/{uid}` | Update actor |
| DELETE | `/actors/{uid}` | Delete actor |

### Relations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/relations` | List relations (filterable) |
| POST | `/relations` | Create relation |
| DELETE | `/relations/{uid}` | Delete relation |

### Readers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/readers` | List available readers |
| GET | `/readers/{name}` | Get reader info |
| POST | `/readers/{name}/scan` | Trigger scan, returns suggestions |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | API & DB health check |

---

## Reader System

### Base Reader Interface

```python
from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel

class Suggestion(BaseModel):
    """A suggested asset from a reader scan."""
    type: str                    # dataset, report, process, system
    name: str
    description: str | None
    location: str | None
    confidence: float            # 0.0 - 1.0
    metadata: dict[str, Any]

class ScanResult(BaseModel):
    """Result of a reader scan."""
    reader: str
    source: str
    suggestions: list[Suggestion]
    errors: list[str]

class BaseReader(ABC):
    """Abstract base class for all readers."""

    name: str                    # Unique reader identifier
    description: str             # What this reader does
    supported_sources: list[str] # e.g., ["*.xlsx", "*.xls"]

    @abstractmethod
    async def scan(self, source: str, **options) -> ScanResult:
        """
        Scan a source and return suggestions.

        Args:
            source: Path, URL, or connection string
            **options: Reader-specific options

        Returns:
            ScanResult with suggested assets
        """
        pass
```

### Reader Discovery

Readers are discovered from:
1. Built-in: `src/holocron/readers/builtin/`
2. Plugins: `plugins/` directory (Python packages with `reader.py`)

```python
# plugins/excel_reader/reader.py
from holocron.readers.base import BaseReader, ScanResult

class ExcelReader(BaseReader):
    name = "excel"
    description = "Reads Excel files and suggests datasets"
    supported_sources = ["*.xlsx", "*.xls"]

    async def scan(self, source: str, **options) -> ScanResult:
        # Implementation here
        ...
```

---

## Docker Setup

### docker-compose.yml

```yaml
services:
  holocron:
    build: .
    ports:
      - "8000:8000"
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=holocron
    depends_on:
      neo4j:
        condition: service_healthy
    volumes:
      - ./plugins:/app/plugins  # Mount custom readers

  neo4j:
    image: neo4j:5
    ports:
      - "7474:7474"  # Browser
      - "7687:7687"  # Bolt
    environment:
      - NEO4J_AUTH=neo4j/holocron
      - NEO4J_PLUGINS=["apoc"]
    volumes:
      - neo4j_data:/data
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  neo4j_data:
```

### Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy and install dependencies
COPY pyproject.toml .
RUN uv pip install --system -e .

# Copy source
COPY src/ src/
COPY plugins/ plugins/

EXPOSE 8000

CMD ["uvicorn", "holocron.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Configuration

Environment variables (via `.env` or docker-compose):

```bash
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=holocron

# API
API_HOST=0.0.0.0
API_PORT=8000
API_DEBUG=false

# Readers
PLUGINS_DIR=./plugins
```

---

## MVP Scope

### In Scope ✅
- CRUD for Assets (all types)
- CRUD for Actors (Person, Group)
- Create/delete Relations
- Basic lineage query (upstream/downstream)
- Reader base class & registry
- Health endpoint
- Docker compose setup

### Out of Scope ❌ (Future)
- Web UI
- Authentication/Authorization
- Full-text search
- Bulk import/export
- Actual reader implementations (Excel, etc.)
- Versioning/history
- Notifications

---

## Next Steps

1. **Initialize project** — pyproject.toml, Makefile, basic structure
2. **Set up Docker** — docker-compose with Neo4j
3. **Implement DB layer** — Connection, base repository
4. **Build API endpoints** — Assets first, then Actors, Relations
5. **Add Reader system** — Base class, registry
6. **Write tests** — Unit + integration

---

*"Simple things should be simple, complex things should be possible."* — Alan Kay
