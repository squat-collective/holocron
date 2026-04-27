.PHONY: help build up down restart logs shell test lint format typecheck check clean openapi

# Default target
.DEFAULT_GOAL := help

# Colors for pretty output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

# Container runtime (podman or docker)
CONTAINER_RUNTIME ?= $(shell command -v podman 2>/dev/null || echo docker)
COMPOSE := $(CONTAINER_RUNTIME) compose

##@ General

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(CYAN)Holocron$(RESET) - Data Governance Platform\n\nUsage:\n  make $(GREEN)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Docker

build: ## Build containers
	$(COMPOSE) build

up: ## Start all services
	$(COMPOSE) up -d

down: ## Stop all services
	$(COMPOSE) down

restart: down up ## Restart all services

logs: ## Show logs (follow mode)
	$(COMPOSE) logs -f

logs-api: ## Show API logs only
	$(COMPOSE) logs -f holocron

logs-db: ## Show Neo4j logs only
	$(COMPOSE) logs -f neo4j

shell: ## Open shell in API container
	$(COMPOSE) exec holocron bash

shell-db: ## Open Neo4j cypher-shell
	$(COMPOSE) exec neo4j cypher-shell -u neo4j -p holocron

ps: ## Show running containers
	$(COMPOSE) ps

##@ Development

install: ## Install dependencies locally (for IDE support)
	uv pip install -e ".[dev]"

test: ## Run tests
	$(COMPOSE) exec holocron pytest -v

test-cov: ## Run tests with coverage
	$(COMPOSE) exec holocron pytest -v --cov --cov-report=term-missing

lint: ## Run linter (ruff)
	$(COMPOSE) exec holocron ruff check src/ tests/

format: ## Format code (ruff)
	$(COMPOSE) exec holocron ruff format src/ tests/
	$(COMPOSE) exec holocron ruff check --fix src/ tests/

typecheck: ## Run type checker (mypy)
	$(COMPOSE) exec holocron mypy src/

check: lint typecheck test ## Run all checks (lint + typecheck + test)

##@ Local Development (without Docker)

local-test: ## Run tests locally
	pytest -v

local-lint: ## Run linter locally
	ruff check src/ tests/

local-format: ## Format code locally
	ruff format src/ tests/
	ruff check --fix src/ tests/

local-typecheck: ## Run type checker locally
	mypy src/

local-check: local-lint local-typecheck local-test ## Run all checks locally

##@ Documentation

openapi: ## Generate OpenAPI spec (writes to monorepo root docs/openapi.json)
	@echo "$(CYAN)Generating OpenAPI spec...$(RESET)"
	@mkdir -p $(CURDIR)/../../docs
	@$(CONTAINER_RUNTIME) run --rm -v $(CURDIR):/app -w /app \
		-e NEO4J_URI=bolt://localhost:7687 \
		-e NEO4J_USER=neo4j \
		-e NEO4J_PASSWORD=dummy \
		python:3.12-slim sh -c "\
		pip install -q uv && \
		uv pip install --system -q -e . && \
		python -c \"import json; from holocron.main import app; print(json.dumps(app.openapi(), indent=2))\"" > $(CURDIR)/../../docs/openapi.json
	@echo "$(GREEN)✓ Generated docs/openapi.json$(RESET)"

##@ Utilities

health: ## Check service health
	@echo "$(CYAN)Checking API health...$(RESET)"
	@curl -s http://localhost:8000/api/v1/health | python3 -m json.tool || echo "API not responding"
	@echo "\n$(CYAN)Checking Neo4j...$(RESET)"
	@$(COMPOSE) exec neo4j neo4j status || echo "Neo4j not responding"

clean: ## Clean up containers, volumes, and cache
	$(COMPOSE) down -v
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

reset: clean ## Full reset (clean + rebuild)
	$(COMPOSE) build --no-cache
