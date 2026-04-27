# Architecture Decision Records (ADRs) 📋

> Documenting the **why** behind architectural decisions

## What is an ADR?

An ADR captures an important architectural decision along with its context and consequences. They help future developers (including ourselves) understand why things are the way they are.

## Index

| # | Title | Status | Date |
|---|-------|--------|------|
| 0001 | [Tech Stack Selection](./0001-tech-stack.md) | Accepted | 2026-01-28 |
| 0002 | [Containerization (Podman)](./0002-containerization-podman.md) | Accepted | 2026-01-28 |

<!-- Template for new entries:
| 0001 | [Title](./0001-title.md) | Accepted | YYYY-MM-DD |
-->

## Creating a New ADR

1. Copy the template below
2. Create file: `NNNN-short-title.md` (zero-padded number)
3. Fill in all sections
4. Update the index above
5. Get review if needed

## Template

```markdown
# ADR-NNNN: Title

## Status

Proposed | Accepted | Deprecated | Superseded by [ADR-XXXX](./XXXX-*.md)

## Date

YYYY-MM-DD

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

### Positive
- What becomes easier?

### Negative
- What becomes harder?

### Neutral
- What other changes need to happen?

## Alternatives Considered

### Alternative 1: Name
- Description
- Why rejected

## References

- Links to relevant resources
```

## Guidelines

- **One decision per ADR** - Keep them focused
- **Immutable once accepted** - Create new ADR to change, mark old as superseded
- **Context is key** - Future readers need to understand the situation
- **Be honest about trade-offs** - Document the downsides too
