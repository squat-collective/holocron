# Holocron 📚

> A declarative data governance platform that generates documentation about data assets, their sources, usage, and lineage.

## 🎯 Vision

- **Neo4j** stores assets, relations, groups, and metadata (single source of truth)
- **REST API** is the core interface (enables CLI, SDKs, frontends, MCP)
- **Readers** (plugins) discover assets from various sources and push to the API
- Import/export (YAML/JSON) will be a separate feature later

## 📁 Structure

```
holocron/
├── src/holocron/        # Core application
├── plugins/             # Custom readers (loaded at runtime)
├── tests/               # Unit + integration tests
├── docs/                # Project documentation
├── Makefile             # All commands
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml
```

## 📏 Guidelines

### Development
- **Containerized** — Everything runs in Docker/Podman. Never install on host.
- **TDD** — Write tests first. No code without tests.
- **KISS** — Build only what's needed. Simple > clever.
- **API-first** — All access goes through the REST API.

### Tooling
- **uv** — Package management, linting, formatting
- **mypy** — Type checking (strict mode)

### Commands
- **Makefile** — All commands go through `make`. Run `make help` for options.

### Code Quality
- **Type hints** — Mandatory on all functions and methods
- **Strict typing** — No `Any` unless absolutely necessary
- **Zero lint errors** — Must pass before commit

### Documentation
- **Mandatory docs** — README.md, CHANGELOG.md, docs/ folder
- **Docstrings** — Required for all public interfaces (Google-style)
- **Update together** — Docs update with code in same PR

### Tech Stack
- Python 3.12+
- FastAPI
- Neo4j
- Pydantic v2
- pytest

---

*"A Holocron is a repository of knowledge, containing ancient wisdom and guiding those who seek it."*
