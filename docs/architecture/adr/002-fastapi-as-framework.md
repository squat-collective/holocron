# ADR-002: FastAPI as Web Framework

**Date:** 2026-01-27
**Status:** Accepted
**Deciders:** Tom

## Context

Holocron needs a REST API as its core interface. The API will be consumed by:
- Web UI (primary, future)
- CLI tools (future)
- MCP integrations (future)
- Direct API calls

Requirements:
- RESTful endpoints with JSON
- Request/response validation
- Auto-generated API documentation
- Async support (for Neo4j driver)
- Type safety

## Decision

**Use FastAPI as the web framework.**

## Options Considered

### 1. Flask
**Pros:**
- Simple, minimal
- Large ecosystem
- Very flexible

**Cons:**
- No built-in validation
- No auto-generated docs
- Sync by default (async is bolt-on)
- Manual OpenAPI spec

### 2. Django + DRF
**Pros:**
- Batteries included
- Strong ORM
- Admin interface

**Cons:**
- Heavy for our use case (no SQL ORM needed)
- Opinionated structure
- Async support is recent/limited

### 3. FastAPI ✅ Selected
**Pros:**
- Native async/await
- Pydantic integration (validation + serialization)
- Auto-generated OpenAPI docs
- Type hints everywhere
- Modern Python (3.10+)

**Cons:**
- Smaller ecosystem than Flask/Django
- Less "magic" (more explicit code)

### 4. Litestar (formerly Starlite)
**Pros:**
- Similar to FastAPI
- Some performance improvements

**Cons:**
- Smaller community
- Less documentation
- Unnecessary risk for MVP

## Rationale

1. **Pydantic Integration**: We're already using Pydantic for domain models. FastAPI's native integration means request validation, response serialization, and OpenAPI generation come free.

2. **Async Native**: Neo4j's Python driver supports async. FastAPI makes async endpoints natural, not bolted-on.

3. **API Documentation**: Auto-generated Swagger/OpenAPI docs help us iterate quickly and help future UI/CLI developers understand the API.

4. **Type Safety**: FastAPI enforces type hints, aligning with our "strict typing" guideline.

```python
# Example: Types flow from Pydantic to API to docs
class AssetCreate(BaseModel):
    name: str
    description: str | None = None
    type: AssetType

@router.post("/assets", response_model=Asset)
async def create_asset(asset: AssetCreate) -> Asset:
    # Validated input, typed output, documented automatically
    ...
```

## Consequences

### Positive
- Instant API documentation at `/docs`
- Type errors caught at development time
- Clean async code with Neo4j
- Pydantic schemas shared between API and domain

### Negative
- Team needs FastAPI knowledge
- Some Flask/Django patterns don't apply
- Dependency injection style may feel different

### Mitigations
- FastAPI docs are excellent
- Patterns are well-established
- Most Python developers pick it up quickly

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic v2 Documentation](https://docs.pydantic.dev/)
