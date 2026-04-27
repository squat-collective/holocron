.PHONY: help up down restart logs ps clean openapi api-% sdk-% ui-% prod-up prod-down prod-logs prod-pull prod-ps prod-up-caddy

# Default target
.DEFAULT_GOAL := help

# Colors
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

# Container runtime (podman or docker)
CONTAINER_RUNTIME ?= $(shell command -v podman 2>/dev/null || echo docker)
COMPOSE := $(CONTAINER_RUNTIME) compose

##@ General

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(CYAN)Holocron Monorepo$(RESET) - Data Governance Platform\n\nUsage:\n  make $(GREEN)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@printf "\n$(YELLOW)Per-package targets$(RESET)\n"
	@printf "  $(GREEN)api-%%$(RESET)               Forward target to packages/api/Makefile (e.g. make api-test)\n"
	@printf "  $(GREEN)sdk-%%$(RESET)               Forward target to packages/sdk-ts (bun script)\n"
	@printf "  $(GREEN)ui-%%$(RESET)                Forward target to packages/ui/Makefile (e.g. make ui-dev)\n"

##@ Full Stack (Docker)

up: ## Start neo4j + api + ui
	$(COMPOSE) up -d
	@echo "$(GREEN)✓ Stack running$(RESET)"
	@echo "  API:  http://localhost:8100"
	@echo "  UI:   http://localhost:3333"
	@echo "  Neo4j: http://localhost:7474"

down: ## Stop all services
	$(COMPOSE) down

restart: down up ## Restart all services

logs: ## Show logs (follow)
	$(COMPOSE) logs -f

ps: ## Show running containers
	$(COMPOSE) ps

##@ Production (GHCR images)

PROD_COMPOSE := $(COMPOSE) -f compose.prod.yml
PROD_COMPOSE_CADDY := $(PROD_COMPOSE) -f compose.prod.caddy.yml

prod-up: ## Start prod stack from GHCR images (requires .env)
	@test -f .env || (echo "Missing .env — copy .env.example and edit." && exit 1)
	$(PROD_COMPOSE) pull
	$(PROD_COMPOSE) up -d
	@echo "$(GREEN)✓ Prod stack running$(RESET)"

prod-up-caddy: ## Start prod stack + Caddy reverse proxy (requires .env + Caddyfile)
	@test -f .env || (echo "Missing .env — copy .env.example and edit." && exit 1)
	@test -f Caddyfile || (echo "Missing Caddyfile — copy Caddyfile.example and edit." && exit 1)
	$(PROD_COMPOSE_CADDY) pull
	$(PROD_COMPOSE_CADDY) up -d
	@echo "$(GREEN)✓ Prod stack running behind Caddy$(RESET)"

prod-down: ## Stop prod stack
	$(PROD_COMPOSE) down

prod-logs: ## Tail prod logs
	$(PROD_COMPOSE) logs -f

prod-pull: ## Pull latest GHCR images without restarting
	$(PROD_COMPOSE) pull

prod-ps: ## Show prod containers
	$(PROD_COMPOSE) ps

##@ Per-Package (forwards)

api-%: ## Forward to packages/api Makefile (e.g. make api-test)
	$(MAKE) -C packages/api $*

ui-%: ## Forward to packages/ui Makefile (e.g. make ui-dev)
	$(MAKE) -C packages/ui $*

sdk-%: ## Forward to packages/sdk-ts via bun (e.g. make sdk-build)
	cd packages/sdk-ts && bun run $*

docs-%: ## Forward to packages/docs-site Makefile (e.g. make docs-dev)
	$(MAKE) -C packages/docs-site $*

##@ Workspace

install: ## Install JS workspace deps (bun)
	bun install

build-sdk: ## Build the TypeScript SDK
	cd packages/sdk-ts && bun run build

##@ Documentation

openapi: ## Regenerate docs/openapi.json from running API code
	$(MAKE) -C packages/api openapi

##@ Utilities

health: ## Check service health
	@echo "$(CYAN)API:$(RESET)"
	@curl -s http://localhost:8100/api/v1/health | python3 -m json.tool || echo "  API not responding"
	@echo "$(CYAN)UI:$(RESET)"
	@curl -sI http://localhost:3333 | head -1 || echo "  UI not responding"
	@echo "$(CYAN)Neo4j:$(RESET)"
	@$(COMPOSE) exec neo4j neo4j status 2>/dev/null || echo "  Neo4j not responding"

clean: ## Stop everything and prune build artifacts
	$(COMPOSE) down -v
	rm -rf node_modules packages/*/node_modules packages/*/.next packages/sdk-ts/dist
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
