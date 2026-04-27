# Architecture 🏛️

> System design and architectural documentation for Holocron Portal

## 📋 Overview

Holocron Portal is a **data documentation platform** built with:

- **Next.js 15** (App Router) - React framework with server components
- **TypeScript** (strict mode) - Type safety throughout
- **shadcn/ui** - Component library built on Radix primitives
- **TanStack Query v5** - Server state management
- **holocron-ts SDK** - API client for Holocron backend
- **Bun** - JavaScript runtime and package manager

## 🎯 Core Principles

1. **Server-first** - Server components by default, client only when needed
2. **Type safety** - Strict TypeScript, no `any`, typed errors
3. **Test-driven** - TDD approach, tests before implementation
4. **Containerized** - All development in Docker, never on host

## 📁 Sections

- [Architecture Decision Records (ADRs)](./adr/README.md) - Why we made certain choices
- [Architecture Design Documents (ADDs)](./add/README.md) - How things are built

## 🔗 Related

- [Project README](../../CLAUDE.md)
- [Journal](../journal/README.md)
