# ADR-003: Reader Plugin Architecture

**Date:** 2026-01-27
**Status:** ⚠️ **Superseded by [ADR-006](006-plugin-sdk-entry-points.md)** (2026-04-26)
**Deciders:** Tom

> The "reader" naming and the `/readers/{name}/scan` API have been replaced by
> the generic plugin system: a public `holocron-plugin-sdk` package, entry-point
> discovery via the `holocron.plugins` group, in-process invocation through
> `POST /api/v1/plugins/{slug}/run`, and three capability families
> (connectors, exporters, audit/extension plugins). The "suggest don't write"
> model was dropped — plugins now have full service access via `PluginContext`.
> See [ADR-006](006-plugin-sdk-entry-points.md) for the rationale.

## Context

Holocron needs "readers" — components that scan external sources (Excel files, databases, etc.) and suggest metadata about data assets. This is how Holocron learns about existing data without requiring 100% manual entry.

Key requirements:
- Readers should be extensible (add new source types)
- Readers output **suggestions**, not direct writes (human approval required)
- Simple to implement new readers
- Must work in containerized environment

## Decision

**Implement readers as in-process Python plugins that return suggestions via API.**

### Reader Behavior
1. Readers are triggered via API: `POST /api/v1/readers/{name}/scan`
2. Readers receive a source path/URL and options
3. Readers return suggestions (ephemeral, not persisted)
4. Humans review suggestions and create assets via separate API calls

### Plugin Structure
```
plugins/
└── excel_reader/
    ├── __init__.py
    └── reader.py      # Contains class extending BaseReader
```

## Options Considered

### 1. In-Process Python Modules ✅ Selected
**Pros:**
- Simplest to implement
- No IPC overhead
- Easy debugging
- Shared types with core

**Cons:**
- Bad reader can crash the app
- All readers must be Python
- Memory shared with main process

### 2. Subprocess (exec)
**Pros:**
- Process isolation
- Can be any language
- Crash isolation

**Cons:**
- IPC complexity (stdin/stdout JSON)
- Harder to debug
- Dependency management per reader

### 3. Container per Reader
**Pros:**
- Maximum isolation
- Independent scaling
- Any language/runtime

**Cons:**
- Complex orchestration
- Slow startup
- Overkill for MVP

### 4. External Services (webhooks)
**Pros:**
- Fully decoupled
- Can run anywhere

**Cons:**
- Network complexity
- Auth/security concerns
- Deployment overhead

## Rationale

For MVP, **simplicity wins**. In-process plugins:
- Are trivial to implement (just Python classes)
- Share Pydantic models with the core
- Can be unit tested easily
- Don't require container orchestration

The design **doesn't prevent** moving to subprocess or containers later. The `BaseReader` interface is the contract — implementation can change.

### Suggestion Model (Not Direct Writes)

Critical design choice: readers **suggest**, they don't create.

```python
# Reader returns suggestions
POST /readers/excel/scan {"source": "/data/file.xlsx"}
→ {"suggestions": [{"type": "dataset", "name": "Sheet1", ...}]}

# Human reviews and creates
POST /assets {"type": "dataset", "name": "Sheet1", ...}
```

Why:
- **Human stays in control** — readers can be wrong
- **Auditability** — humans are accountable for what's in Holocron
- **Simplicity** — readers don't need write access to DB
- **KISS** — no approval workflow state machine needed

## Consequences

### Positive
- Easy to write new readers (just extend BaseReader)
- No infrastructure complexity
- Suggestions are simple API responses
- Clear separation: readers suggest, humans decide

### Negative
- Readers share process memory
- A bad reader can affect API performance
- All readers must be Python

### Mitigations
- Timeouts on reader scan operations
- Input validation before passing to readers
- Consider process isolation if readers become untrusted

## Reader Interface

```python
from abc import ABC, abstractmethod
from pydantic import BaseModel

class Suggestion(BaseModel):
    type: str                    # dataset, report, etc.
    name: str
    description: str | None
    location: str | None
    confidence: float            # 0.0 - 1.0
    metadata: dict[str, Any]

class ScanResult(BaseModel):
    reader: str
    source: str
    suggestions: list[Suggestion]
    errors: list[str]

class BaseReader(ABC):
    name: str
    description: str
    supported_sources: list[str]  # glob patterns

    @abstractmethod
    async def scan(self, source: str, **options) -> ScanResult:
        """Scan source and return suggestions."""
        pass
```

## References

- [Python Plugin Patterns](https://packaging.python.org/en/latest/guides/creating-and-discovering-plugins/)
- [Entry Points for Plugins](https://setuptools.pypa.io/en/latest/userguide/entry_point.html)
