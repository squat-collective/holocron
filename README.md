# Holocron 📚

> A declarative data governance platform that generates documentation about data assets, their sources, usage, and lineage.

## Quick Start

```bash
# Start services
make up

# Check health
make health

# View logs
make logs

# Stop services
make down
```

## Development

```bash
# Run tests
make test

# Run linter
make lint

# Format code
make format

# Type check
make typecheck

# Run all checks
make check
```

## Architecture

```
┌─────────────────────────────────────────┐
│            REST API (FastAPI)           │
│              /api/v1/...                │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐    ┌──────────────────┐
│  Core Logic   │    │  Reader System   │
│  (Services)   │    │   (Plugins)      │
└───────────────┘    └──────────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
        ┌──────────────────────┐
        │   Neo4j (Graph DB)   │
        └──────────────────────┘
```

## Documentation

- [Architecture Overview](docs/architecture/specs/mvp-architecture.md)
- [Architecture Decisions](docs/architecture/adr/)
- [Vision & Goals](docs/architecture/research/2026-01-27-vision-clarification.md)

## License

MIT
