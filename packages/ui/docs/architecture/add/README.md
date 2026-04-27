# Architecture Design Documents (ADDs) 📐

> Documenting the **how** of system components and features

## What is an ADD?

An ADD describes the detailed design of a component, feature, or system. Unlike ADRs (which capture decisions), ADDs are living documents that evolve with the implementation.

## Index

| Document | Component | Status | Last Updated |
|----------|-----------|--------|--------------|
| [Product Vision](./001-product-vision.md) | Full System | Draft | 2026-01-28 |
| [System Architecture](./002-system-architecture.md) | Full System | Draft | 2026-01-28 |

<!-- Template for new entries:
| [Feature Name](./feature-name.md) | Component | Draft/Active/Deprecated | YYYY-MM-DD |
-->

## Creating a New ADD

1. Copy the template below
2. Create file: `component-name.md` (kebab-case)
3. Fill in relevant sections
4. Update the index above
5. Keep it updated as implementation evolves

## Template

```markdown
# ADD: Component/Feature Name

## Status

Draft | Active | Deprecated

## Last Updated

YYYY-MM-DD

## Overview

Brief description of what this component/feature does.

## Goals

- What are we trying to achieve?
- What problems does this solve?

## Non-Goals

- What is explicitly out of scope?

## Design

### High-Level Architecture

```
[Diagram or description of how components interact]
```

### Data Model

```typescript
// Key types and interfaces
```

### API / Interface

```typescript
// Public API surface
```

### Key Flows

1. **Flow Name**: Step-by-step description

## Implementation Details

### File Structure

```
src/
└── feature/
    ├── components/
    ├── hooks/
    └── utils/
```

### Dependencies

- Internal: What other parts of the system does this depend on?
- External: What external packages are used?

### Error Handling

How errors are handled and surfaced to users.

## Testing Strategy

- Unit tests: What to test in isolation
- Integration tests: What flows to test end-to-end

## Security Considerations

Any security implications or mitigations.

## Performance Considerations

Any performance implications or optimizations.

## Open Questions

- [ ] Unresolved design questions

## References

- Links to relevant ADRs, external docs, etc.
```

## Guidelines

- **Living documents** - Update as implementation evolves
- **Start with goals** - Be clear about what you're solving
- **Include diagrams** - Visual representations help understanding
- **Document trade-offs** - Why this design over alternatives
