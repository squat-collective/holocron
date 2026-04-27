# ADR-0002: Containerization with Podman

**Status**: Accepted
**Date**: 2026-01-28
**Deciders**: Tom

---

## Context

We need a container runtime for development. Per project guidelines, all development happens in containers - nothing installed directly on the host machine.

### Requirements

1. **Rootless** — No need for elevated privileges
2. **Docker-compatible** — Use existing tooling knowledge
3. **Compose support** — Multi-container orchestration
4. **Already available** — Part of existing infrastructure

---

## Decision

We will use **Podman** with `podman compose` for container management.

| Aspect | Choice |
|--------|--------|
| Runtime | Podman (rootless) |
| Compose | `podman compose` (uses docker-compose backend) |
| Network | External `holocron` network |
| Port | 3333 (host) → 3000 (container) |

---

## Rationale

### Podman over Docker

| Pro | Con |
|-----|-----|
| Rootless by default | Slightly different behavior |
| Daemonless (no background service) | Newer, some edge cases |
| Drop-in Docker replacement | |
| Already installed on host | |
| OCI-compliant | |

### podman compose

Uses the Docker Compose plugin under the hood, ensuring compatibility with standard `docker-compose.yml` files.

---

## Implementation

### docker-compose.yml
```yaml
services:
  dev:
    image: oven/bun:1
    container_name: holocron-portal-dev
    working_dir: /app
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    ports:
      - "3333:3000"  # Avoid conflict with other services
    networks:
      - holocron  # External network for Holocron API access
```

### Commands
```bash
podman compose up -d      # Start container
podman compose exec dev bash  # Shell access
podman compose down       # Stop container
```

---

## Consequences

### Positive

1. **Security** — Rootless containers, no privilege escalation
2. **Compatibility** — Works with existing compose files
3. **Integration** — Connects to holocron network for API access
4. **Simplicity** — Same commands as Docker

### Negative

1. **Volume permissions** — May need `:Z` suffix on SELinux systems
2. **Slightly different** — Some edge cases behave differently than Docker

---

## Known Issues

### Production build error (Bun + Next.js 15)

The `next build` command fails with a `<Html>` import error. This is a known compatibility issue between Bun and Next.js 15's build process.

**Workaround**: Development mode (`bun run dev`) works perfectly. For production, consider:
1. Using Node.js for builds
2. Waiting for Bun compatibility fix
3. Using a separate build container with Node

**Status**: Dev mode works, build can be addressed later.

---

## References

- [Podman Documentation](https://podman.io/)
- [podman-compose](https://github.com/containers/podman-compose)
