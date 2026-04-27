# Holocron Portal - Development Commands
# Usage: make <target>

.PHONY: help init up down shell dev build test test-watch lint format typecheck install clean logs

# Default target
help:
	@echo "🌌 Holocron Portal - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make init          Initialize Next.js project (first time)"
	@echo "  make install       Install dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make up            Start container (background)"
	@echo "  make down          Stop container"
	@echo "  make shell         Open shell in container"
	@echo "  make dev           Start dev server"
	@echo "  make logs          View container logs"
	@echo ""
	@echo "Build & Test:"
	@echo "  make build         Production build"
	@echo "  make test          Run all tests"
	@echo "  make test-watch    Run tests in watch mode"
	@echo "  make test-e2e      Run Playwright E2E tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint          Run Biome linter"
	@echo "  make format        Format code with Biome"
	@echo "  make typecheck     TypeScript type check"
	@echo "  make check         Run all checks (lint + typecheck + test)"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean         Remove node_modules and build artifacts"

# === Setup ===

init:
	@echo "🚀 Initializing Next.js project..."
	podman compose run --rm dev bunx create-next-app@latest . \
		--typescript \
		--tailwind \
		--eslint=false \
		--app \
		--src-dir \
		--import-alias "@/*" \
		--use-bun
	@echo "✅ Project initialized!"
	@echo "💡 Next: make install && make dev"

install:
	podman compose run --rm dev bun install

# === Development ===

up:
	podman compose up -d
	@echo "✅ Container running. Use 'make shell' or 'make dev'"

down:
	podman compose down

shell:
	podman compose exec dev bash

dev:
	podman compose exec dev bun run dev

logs:
	podman compose logs -f dev

# === Build & Test ===

build:
	podman compose exec dev bun run build

test:
	podman compose exec dev bun run test

test-watch:
	podman compose exec dev bun run test:watch

test-e2e:
	podman compose exec dev bun run test:e2e

# === Code Quality ===

lint:
	podman compose exec dev bun run lint

format:
	podman compose exec dev bun run format

typecheck:
	podman compose exec dev bun run typecheck

check: lint typecheck test
	@echo "✅ All checks passed!"

# === Utilities ===

clean:
	podman compose down -v
	rm -rf node_modules .next
	@echo "🧹 Cleaned!"
