# syntax=docker/dockerfile:1.7
# Build context = monorepo root (so we can resolve workspace:* deps).
# Build:  docker build -f packages/mcp-server/Dockerfile -t holocron-mcp-server .
#
# Runtime is stdio: the container expects to be `docker run -i ...` from
# an MCP client (Claude Desktop, Claude Code, etc). It does NOT expose
# any HTTP port and has no HEALTHCHECK — a stdio MCP server's only
# liveness signal is the open stdin pipe to its parent.

# ---------- deps ----------
FROM oven/bun:1 AS deps
WORKDIR /repo

COPY package.json bun.lock ./
COPY packages/sdk-ts/package.json packages/sdk-ts/
COPY packages/ui/package.json packages/ui/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/docs-site/package.json packages/docs-site/

RUN bun install --frozen-lockfile

# ---------- builder ----------
FROM oven/bun:1 AS builder
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/sdk-ts/node_modules ./packages/sdk-ts/node_modules
COPY --from=deps /repo/packages/mcp-server/node_modules ./packages/mcp-server/node_modules

COPY package.json bun.lock ./
COPY packages/sdk-ts ./packages/sdk-ts
COPY packages/mcp-server ./packages/mcp-server

# SDK must be built before the MCP server can resolve `@squat-collective/holocron-ts`.
RUN bun run --filter @squat-collective/holocron-ts build

# bun bundles the MCP server + every workspace+npm dep into a single
# node-ESM file at packages/mcp-server/dist/index.js. The follow-up
# `tsc -p tsconfig.build.json` step from the host script only emits
# `.d.ts` declarations — those aren't needed for an end-user runtime
# image, so we skip the typecheck pass here and run the bundle alone.
# That avoids the TS in-memory program that OOMs on small build hosts.
RUN cd packages/mcp-server && bun build ./src/index.ts --outdir ./dist --target node

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Default points at the in-network API service; override with
# `-e HOLOCRON_API_URL=...` for any other deployment.
ENV HOLOCRON_API_URL=http://api:8000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 mcp

COPY --from=builder --chown=mcp:nodejs /repo/packages/mcp-server/dist ./dist
COPY --from=builder --chown=mcp:nodejs /repo/packages/mcp-server/package.json ./package.json
COPY --from=builder --chown=mcp:nodejs /repo/packages/mcp-server/README.md ./README.md

USER mcp

# Stdio entrypoint — must be the *only* thing on stdout.
# The startup banner in src/index.ts is written to stderr on purpose.
ENTRYPOINT ["node", "dist/index.js"]
