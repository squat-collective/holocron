# syntax=docker/dockerfile:1.7
# Build context = monorepo root (so we can resolve workspace:* deps).
# Build:  docker build -f packages/ui/Dockerfile -t holocron-ui .

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
COPY --from=deps /repo/packages/ui/node_modules ./packages/ui/node_modules

COPY package.json bun.lock ./
COPY packages/sdk-ts ./packages/sdk-ts
COPY packages/ui ./packages/ui

# SDK must be built before the UI can resolve `@squat-collective/holocron-ts`.
RUN bun run --filter @squat-collective/holocron-ts build
RUN bun run --filter holocron-portal build

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Next.js standalone emits a minimal server.js + traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /repo/packages/ui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/packages/ui/.next/static ./packages/ui/.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["node", "packages/ui/server.js"]
