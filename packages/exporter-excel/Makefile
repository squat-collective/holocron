.PHONY: help install test lint format typecheck check clean

.DEFAULT_GOAL := help

CYAN := \033[36m
GREEN := \033[32m
RESET := \033[0m

CONTAINER_RUNTIME ?= $(shell command -v podman 2>/dev/null || echo docker)
PY_IMAGE := python:3.12-slim
RUN := $(CONTAINER_RUNTIME) run --rm -v $(CURDIR):/app -w /app $(PY_IMAGE) sh -c

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(CYAN)excel-exporter$(RESET)\n\nUsage:\n  make $(GREEN)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install:
	$(RUN) "pip install -q uv && uv pip install --system -q -e '.[dev]'"

test: ## Run all tests
	$(RUN) "pip install -q uv && uv pip install --system -q -e '.[dev]' && pytest -v"

lint:
	$(RUN) "pip install -q uv && uv pip install --system -q -e '.[dev]' && ruff check src/ tests/"

format:
	$(RUN) "pip install -q uv && uv pip install --system -q -e '.[dev]' && ruff format src/ tests/ && ruff check --fix src/ tests/"

typecheck:
	$(RUN) "pip install -q uv && uv pip install --system -q -e '.[dev]' && mypy src/"

check: lint typecheck test

clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache *.egg-info
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
