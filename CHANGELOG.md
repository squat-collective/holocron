# Changelog

All notable changes to Holocron will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases on the `main` branch are pre-release alphas. From `v0.0.4-alpha`
onwards, this file is maintained by
[release-please](https://github.com/googleapis/release-please) — every PR
with a conventional-commit title (`feat:`, `fix:`, `perf:`, …) becomes
an entry in the next release section automatically. What's pending for
the next release is visible on the open `release-please` PR; it lands
here only when that PR is merged.

## [0.0.4-alpha] — 2026-04-27

> Re-tag of the original `v0.1.0-alpha` release commit. The first cut overstated the change scope (one bug fix plus a new installer flag) so it was renamed to `v0.0.4-alpha` to keep the version trajectory honest. `v0.1.0-alpha` is no longer published as a release or tag; the GHCR images at that tag remain (same digest as `v0.0.4-alpha`) for anyone who happened to pin against them.

First pre-release after migrating the repo to `squat-collective`. Image registry, npm scope, and tag-triggered release workflow all moved over.

### Added
- `install.sh --update` (or `HOLOCRON_UPDATE=1`) refreshes `compose.prod.yml` + `.env.example` from the requested release with timestamped `.bak` of the previous, merges only-missing keys from the new `.env.example` into the user's `.env` non-destructively, bumps `HOLOCRON_VERSION=`, then runs the existing `compose pull && up -d` flow. `--backup` (or `HOLOCRON_BACKUP=1`) tars the Neo4j volume before pulling.

### Fixed
- The galaxy-map cache now invalidates on every asset/actor/rule/relation write — new entities show up on `/?mode=map` without an API restart. The cache invalidation rides on the existing event-bus that already feeds webhooks.

### Documentation
- `docs/deployment.md` documents the `--update` flow end-to-end (timestamped backups, additive `.env` merge, version bump).
- `docs/getting-started.md` cross-links the upgrade path.

## [0.0.3] — 2026-04-27

### Fixed
- Release assets now ship `env.example` (without the leading dot) so GitHub Releases preserves it on upload — `install.sh` continues to download it as `.env.example` locally.

## [0.0.2] — 2026-04-27

### Fixed
- API Dockerfile filters the SDK package correctly during the build context preparation, so `packages/sdk-ts` no longer ends up in the API image.

## [0.0.1] — 2026-04-27

### Added
- Initial public release of Holocron under `squat-collective/holocron`. Multi-arch (`linux/amd64` + `linux/arm64`) Docker images for `holocron-api` and `holocron-ui` published to GHCR. `install.sh` one-click installer + Caddy overlay for public deploys.

[0.0.4-alpha]: https://github.com/squat-collective/holocron/compare/v0.0.3...v0.0.4-alpha
[0.0.3]: https://github.com/squat-collective/holocron/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/squat-collective/holocron/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/squat-collective/holocron/releases/tag/v0.0.1
