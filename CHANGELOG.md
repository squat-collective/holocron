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

## [0.3.0-alpha](https://github.com/squat-collective/holocron/compare/v0.2.0-alpha...v0.3.0-alpha) (2026-04-29)


### Added

* **mcp:** schema tools — manage containers + fields without round-tripping the asset ([#41](https://github.com/squat-collective/holocron/issues/41)) ([66c8051](https://github.com/squat-collective/holocron/commit/66c80513f4fc744a0405beefd643e960ac190b50))


### Fixed

* **ui:** pin lineage canvas to h-[60vh] so ReactFlow can measure it ([#40](https://github.com/squat-collective/holocron/issues/40)) ([bb03d0c](https://github.com/squat-collective/holocron/commit/bb03d0cf62a12eb180fbf34044ffcfca6101c818))

## [0.2.0-alpha](https://github.com/squat-collective/holocron/compare/v0.1.0-alpha...v0.2.0-alpha) (2026-04-29)


### Added

* **mcp:** ship MCP server as a GHCR image + tool catch-up ([#24](https://github.com/squat-collective/holocron/issues/24)) ([#31](https://github.com/squat-collective/holocron/issues/31)) ([49ccb89](https://github.com/squat-collective/holocron/commit/49ccb89a9da5e66fc6bbc8007872813b3ebd285e))
* **ui:** relations palette extension — Delete + Open source/target ([#30](https://github.com/squat-collective/holocron/issues/30)) ([#38](https://github.com/squat-collective/holocron/issues/38)) ([9b29f3e](https://github.com/squat-collective/holocron/commit/9b29f3e46f120c266d922fc2626b14809ecc7ce4))


### Fixed

* **api,ui:** polymorphic /entities/{uid} kills the actors→assets 404 storm ([#26](https://github.com/squat-collective/holocron/issues/26)) ([#29](https://github.com/squat-collective/holocron/issues/29)) ([f0107e7](https://github.com/squat-collective/holocron/commit/f0107e76439fc2465b7d8266f69ec5e4f87e8892))
* **api,ui:** wizard pickers now filter by kind/type server-side ([#32](https://github.com/squat-collective/holocron/issues/32)) ([#36](https://github.com/squat-collective/holocron/issues/36)) ([18347a4](https://github.com/squat-collective/holocron/commit/18347a4ee7e2e5ba9d308b9d8dd63bfd14c16eca))
* **ui:** galaxy map jitter — kill the 60 Hz render storm ([#25](https://github.com/squat-collective/holocron/issues/25)) ([#34](https://github.com/squat-collective/holocron/issues/34)) ([dd055a7](https://github.com/squat-collective/holocron/commit/dd055a792d5bdb3bc46deb1ae5a15061a4cf5eec))
* **ui:** pin wizard header + footer; only the body scrolls ([#33](https://github.com/squat-collective/holocron/issues/33)) ([#37](https://github.com/squat-collective/holocron/issues/37)) ([5fb6f0b](https://github.com/squat-collective/holocron/commit/5fb6f0b03129e2748d591e331d5c09b08958488f))

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
