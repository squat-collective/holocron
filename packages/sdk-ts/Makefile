.PHONY: help install test lint lint-fix format typecheck check generate-types build publish docs docs-serve clean shell

# Default target
help:
	@echo "holocron-ts - TypeScript SDK for Holocron API"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  install        Install dependencies"
	@echo "  test           Run tests"
	@echo "  lint           Run linter"
	@echo "  lint-fix       Run linter and fix issues"
	@echo "  format         Format code"
	@echo "  typecheck      Run TypeScript type checking"
	@echo "  check          Run all checks (lint + typecheck + test)"
	@echo "  generate-types Generate types from OpenAPI spec"
	@echo "  build          Build the package"
	@echo "  publish        Publish to GitHub Packages"
	@echo "  docs           Generate documentation"
	@echo "  docs-serve     Generate and serve docs on port 3000"
	@echo "  clean          Remove build artifacts"
	@echo "  shell          Open a shell in the dev container"

# Container command prefix
RUN := podman compose run --rm dev

# Dependencies
install:
	$(RUN) bun install

# Testing
test:
	$(RUN) bun test

# Linting & Formatting
lint:
	$(RUN) bun run lint

lint-fix:
	$(RUN) bun run lint:fix

format:
	$(RUN) bun run format

# Type checking
typecheck:
	$(RUN) bun run typecheck

# Run all checks
check: lint typecheck test

# Generate types from OpenAPI
generate-types:
	$(RUN) bun run generate-types

# Build
build:
	$(RUN) bun run build

# Publish to GitHub Packages
publish: build
	$(RUN) npm publish

# Documentation
docs:
	$(RUN) bun run docs

docs-serve: docs
	@echo "Serving docs on http://localhost:3000 (Ctrl+C to stop)"
	podman compose up docs

# Clean
clean:
	rm -rf dist node_modules docs-dist

# Development shell
shell:
	podman compose run --rm dev sh
