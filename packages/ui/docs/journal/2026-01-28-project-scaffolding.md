# 2026-01-28: Project Scaffolding 🏗️

## Summary

Set up the Next.js 15 project with Bun in Podman containers. Dev server working, production build has a known issue.

## What We Did

### 1. Podman Setup

- Created `docker-compose.yml` for Podman
- Using `podman compose` (docker-compose backend)
- Port 3333 (avoiding conflict with other services)
- Connected to external `holocron` network

### 2. Next.js Project Structure

```
holocron-portal/
├── src/
│   └── app/
│       ├── layout.tsx      # Root layout
│       ├── page.tsx        # Home page
│       └── globals.css     # Tailwind v4 CSS
├── docker-compose.yml
├── Makefile
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── biome.json
└── .gitignore
```

### 3. Dependencies Installed

| Package | Version | Purpose |
|---------|---------|---------|
| next | 15.x | Framework |
| react | 19.x | UI |
| react-dom | 19.x | React DOM |
| tailwindcss | 4.x | Styling |
| @tailwindcss/postcss | 4.x | PostCSS plugin |
| typescript | 5.x | Language |
| @biomejs/biome | 2.x | Linting |

### 4. Tailwind v4 Migration

Tailwind v4 uses CSS-first configuration:
- No `tailwind.config.ts` needed
- CSS uses `@import "tailwindcss"` instead of `@tailwind` directives
- PostCSS uses `@tailwindcss/postcss` plugin

## Known Issues

### Production Build Error

```
Error: <Html> should not be imported outside of pages/_document.
```

This is a Bun + Next.js 15 compatibility issue affecting only production builds.

**Dev mode works perfectly!**

### Workarounds

1. Use dev mode for now (`make dev`)
2. Later: Use Node.js container for production builds
3. Wait for Bun compatibility fix

## Verification

```bash
# Start container
podman compose up -d

# Run dev server (works!)
podman compose exec dev bun run dev

# Access at http://localhost:3333
```

## Next Steps

- [ ] Add TanStack Query
- [ ] Set up API proxy routes
- [ ] Install holocron-ts SDK
- [ ] Add shadcn/ui components
- [ ] Create first feature (search)

## Tags

`#scaffolding` `#progress` `#podman`
