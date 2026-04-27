# Deployment

> Holocron ships as pre-built images on GHCR. One command gets you a running stack — `curl … | bash` and you're done.

There are three deployment shapes, in increasing order of effort and exposure:

1. **One-click installer** — pulls images from GHCR, generates a password, runs compose. LAN-only.
2. **Caddy overlay** — same as above, fronted by Caddy with optional basic auth and auto-HTTPS. Internet-facing.
3. **Build from source** — the original dev compose at the repo root. For contributors only.

## 1. One-click install

```bash
curl -fsSL https://github.com/squat-collective/holocron/releases/latest/download/install.sh | bash
```

That's it. The installer:

- Detects `docker` or `podman` (in that order) and refuses to continue without one.
- Creates `./holocron/` with `compose.prod.yml` and `.env`.
- Generates a strong `NEO4J_PASSWORD` (32 chars) on first run.
- `compose pull && compose up -d`.
- Polls `GET /api/v1/health` until the API is up, then prints the URLs.

**Pin to a release** instead of `latest`:

```bash
curl -fsSL https://github.com/squat-collective/holocron/releases/download/v0.1.0/install.sh \
  | HOLOCRON_VERSION=v0.1.0 bash
```

**Custom install dir:**

```bash
curl -fsSL .../install.sh | HOLOCRON_DIR=/opt/holocron bash
```

Re-running the installer is safe: it won't overwrite an existing `.env`. To upgrade, change `HOLOCRON_VERSION` in `.env` and run `make prod-pull && make prod-up`.

### Default endpoints

| Service | URL |
|---|---|
| UI | `http://localhost:3333` |
| API | `http://localhost:8100/api/v1/health` |
| Neo4j browser | `http://localhost:7474` (user: `neo4j`, password: in `.env`) |

Override the host ports via `UI_PORT`, `API_PORT`, `NEO4J_HTTP_PORT`, `NEO4J_BOLT_PORT` in `.env`.

## 2. Caddy overlay (public-facing)

The bare prod compose has no auth. To put it on the open internet, layer the Caddy overlay on top:

```bash
cp Caddyfile.example Caddyfile
# edit Caddyfile: set domain, optionally enable basic_auth
echo 'HOLOCRON_DOMAIN=holocron.example.com' >> .env
make prod-up-caddy
```

The overlay (`compose.prod.caddy.yml`) adds a Caddy container that:

- Routes `/api/*` to the API container, everything else to the UI.
- Auto-issues a Let's Encrypt cert when `HOLOCRON_DOMAIN` is a real hostname.
- Optionally basic-auths every request (uncomment the block in `Caddyfile`).

> **Important:** the base `compose.prod.yml` still binds host ports for the UI, API, and Neo4j. To make Caddy the only public entry point, override those `ports:` to bind `127.0.0.1` in your own `compose.override.yml`.

## 3. Build from source

For contributors. The repo root `docker-compose.yml` is the **dev** stack: it builds the API image locally, mounts source for live reload, and runs the UI as `bun dev`. Don't deploy this anywhere.

```bash
make up        # build + start dev stack
make down
make health
```

See [development.md](development.md) for the developer workflow.

## Images

Both images are multi-arch (`linux/amd64`, `linux/arm64`):

- `ghcr.io/squat-collective/holocron-api:<tag>`
- `ghcr.io/squat-collective/holocron-ui:<tag>`

Tag forms produced by the release workflow:

| Tag | Example | When to use |
|---|---|---|
| `latest` | — | Bleeding edge. Fine for tinkering, never for prod. |
| `vX.Y.Z` | `v0.1.0` | Pin to a specific release. **Recommended for prod.** |
| `X.Y.Z` | `0.1.0` | Same as above without the `v` prefix. |
| `sha-<short>` | `sha-d5ad35d` | Pin to an exact commit. For debugging. |

## Environment reference

| Var | Default | Used by | Notes |
|---|---|---|---|
| `NEO4J_PASSWORD` | _(required)_ | neo4j, api | Set by `install.sh` on first run. |
| `HOLOCRON_VERSION` | `latest` | api, ui | Image tag. Pin in prod. |
| `HOLOCRON_IMAGE_OWNER` | `squat-collective` | api, ui | Override if you forked. |
| `UI_PORT` | `3333` | ui | Host port. |
| `API_PORT` | `8100` | api | Host port. |
| `NEO4J_HTTP_PORT` | `7474` | neo4j | Host port. |
| `NEO4J_BOLT_PORT` | `7687` | neo4j | Host port. |
| `HOLOCRON_DOMAIN` | `:80` | caddy | Domain for auto-HTTPS, or `:80` for plain HTTP. |

## Common operations

```bash
# Production
make prod-up          # pull + start
make prod-up-caddy    # pull + start + Caddy front
make prod-down        # stop
make prod-logs        # tail
make prod-pull        # pull new images without restarting
make prod-ps          # which containers are running

# Dev (build from source)
make up / down / restart / logs / health
```

## Health & readiness

- `GET /api/v1/health` returns `{"api": "ok", "neo4j": "ok"}` once both are up. Use this for readiness probes.
- The Neo4j container has its own healthcheck (already wired).
- The UI doesn't expose a dedicated endpoint; `GET /` returning 200 is the proxy for healthy.

## Backups

Neo4j data lives in the `neo4j_data` named volume. Two paths:

```bash
# Snapshot the volume (offline)
docker compose -f compose.prod.yml stop neo4j
docker run --rm -v holocron_neo4j_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/neo4j-$(date +%F).tar.gz -C /data .
docker compose -f compose.prod.yml start neo4j

# Or use neo4j-admin (online for enterprise, offline for community)
docker compose -f compose.prod.yml exec neo4j neo4j-admin database dump neo4j --to-path=/data
```

The API and UI are stateless — redeploy at will.

## Production hardening checklist

The one-click install is "good enough" for an internal LAN. Before exposing it publicly:

- ✅ Pin `HOLOCRON_VERSION` to a real tag (not `latest`).
- ✅ Use the Caddy overlay or your own reverse proxy. The API and UI have no auth.
- ✅ Set a strong `NEO4J_PASSWORD` (the installer does this for you).
- ⚠️ Pin upstream image digests too (`neo4j:5`, `caddy:2`) if you need byte-identical deploys.
- ⚠️ Hit any search endpoint after deploy to warm the embedding model into RAM (~300 MB). Pre-warm at boot if first-request latency matters.
- ⚠️ For high throughput, run multiple API workers behind the proxy. The webhook dispatcher's semaphore is per-process; more workers = more concurrent dispatches.
- ⚠️ Set up backups for `neo4j_data`.

## Releases

Cutting a release is one command:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

`.github/workflows/release.yml` then:

1. Builds `holocron-api` and `holocron-ui` for amd64 + arm64.
2. Pushes to GHCR with `:latest`, `:v0.1.0`, `:0.1.0`, and `:sha-<short>` tags.
3. Creates a GitHub Release with `compose.prod.yml`, `compose.prod.caddy.yml`, `.env.example`, and `install.sh` attached.

Users then `curl … install.sh | bash` and are running your tag.
