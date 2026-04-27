.PHONY: help install dev build start typecheck lint format check clean

CONTAINER_RUNTIME ?= $(shell command -v podman 2>/dev/null || echo docker)
HOST_PORT ?= 3334
REPO_ROOT := $(shell git rev-parse --show-toplevel)

# All commands run inside oven/bun:1 with the repo bind-mounted at /app so
# the markdown loader can reach ../../docs/*.md just like in the monorepo.
RUN := $(CONTAINER_RUNTIME) run --rm -it -v "$(REPO_ROOT):/app" -w /app/packages/docs-site oven/bun:1
RUN_NET := $(CONTAINER_RUNTIME) run --rm -it -v "$(REPO_ROOT):/app" -w /app/packages/docs-site -p $(HOST_PORT):3000 oven/bun:1

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nholocron-docs-site\n\nUsage:\n  make <target>\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install deps (bun) inside container
	$(RUN) bun install

dev: ## Run Next dev server on http://localhost:$(HOST_PORT)
	$(RUN_NET) bun run dev

build: ## Production build
	$(RUN) bun run build

start: ## Run the production server
	$(RUN_NET) bun run start

typecheck: ## tsc --noEmit
	$(RUN) bun run typecheck

lint: ## biome lint
	$(RUN) bun run lint

format: ## biome format --write
	$(RUN) bun run format

check: ## biome check --write
	$(RUN) bun run check

clean: ## Wipe Next cache + build artifacts
	rm -rf .next
