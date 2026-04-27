#!/usr/bin/env bash
# Holocron one-click installer.
#
# Usage:
#   curl -fsSL https://github.com/squat-collective/holocron/releases/latest/download/install.sh | bash
#
# Pin to a release:
#   curl -fsSL https://github.com/squat-collective/holocron/releases/download/v0.1.0/install.sh \
#     | HOLOCRON_VERSION=v0.1.0 bash
#
# Re-running is safe: existing .env is preserved, a `compose pull && up -d`
# upgrades to the version you point at.
set -euo pipefail

REPO="${HOLOCRON_REPO:-squat-collective/holocron}"
VERSION="${HOLOCRON_VERSION:-latest}"
INSTALL_DIR="${HOLOCRON_DIR:-$PWD/holocron}"

c_blue=$'\033[36m'
c_green=$'\033[32m'
c_yellow=$'\033[33m'
c_red=$'\033[31m'
c_reset=$'\033[0m'

log()  { printf '%s==>%s %s\n' "$c_blue" "$c_reset" "$*"; }
ok()   { printf '%s ✓%s %s\n'  "$c_green" "$c_reset" "$*"; }
warn() { printf '%s !%s %s\n'  "$c_yellow" "$c_reset" "$*"; }
die()  { printf '%s ✗%s %s\n'  "$c_red"   "$c_reset" "$*" >&2; exit 1; }

# --- Prereqs ---

if command -v docker >/dev/null 2>&1; then
	RUNTIME=docker
elif command -v podman >/dev/null 2>&1; then
	RUNTIME=podman
else
	die "Neither docker nor podman found. Install one and re-run."
fi

if ! $RUNTIME compose version >/dev/null 2>&1; then
	die "$RUNTIME does not have the 'compose' subcommand. Update $RUNTIME or install the compose plugin."
fi

if ! command -v curl >/dev/null 2>&1; then
	die "curl is required."
fi

ok "Using $RUNTIME compose"

# --- Resolve version → download URL ---

if [ "$VERSION" = "latest" ]; then
	BASE_URL="https://github.com/${REPO}/releases/latest/download"
else
	BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
fi

log "Installing Holocron ${VERSION} into ${INSTALL_DIR}"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# --- Download compose + env template ---

fetch() {
	local name="$1"
	if [ -f "$name" ]; then
		warn "$name exists — keeping local copy"
	else
		curl -fsSL "${BASE_URL}/${name}" -o "$name"
		ok "downloaded $name"
	fi
}

fetch compose.prod.yml
fetch .env.example

# --- Generate .env on first run ---

if [ ! -f .env ]; then
	if command -v openssl >/dev/null 2>&1; then
		PASSWORD="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)"
	else
		PASSWORD="$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | cut -c1-32)"
	fi
	sed -e "s|^NEO4J_PASSWORD=.*|NEO4J_PASSWORD=${PASSWORD}|" \
	    -e "s|^HOLOCRON_VERSION=.*|HOLOCRON_VERSION=${VERSION}|" \
	    .env.example > .env
	chmod 600 .env
	ok "generated .env (NEO4J_PASSWORD set to a random 32-char string)"
else
	warn ".env exists — keeping it. Delete it to regenerate."
fi

# --- Pull + start ---

log "Pulling images…"
$RUNTIME compose -f compose.prod.yml pull

log "Starting stack…"
$RUNTIME compose -f compose.prod.yml up -d

# --- Wait for /health ---

UI_PORT="$(grep -E '^UI_PORT=' .env | cut -d= -f2)"
API_PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2)"
UI_PORT="${UI_PORT:-3333}"
API_PORT="${API_PORT:-8100}"

log "Waiting for API to become healthy (timeout 120s)…"
deadline=$(( $(date +%s) + 120 ))
until curl -fsS "http://localhost:${API_PORT}/api/v1/health" >/dev/null 2>&1; do
	if [ "$(date +%s)" -ge "$deadline" ]; then
		warn "API didn't respond in time. Run '$RUNTIME compose -f compose.prod.yml logs api' to investigate."
		exit 1
	fi
	sleep 2
done
ok "API healthy"

# --- Done ---

cat <<EOF

${c_green}Holocron is up.${c_reset}

  UI:    http://localhost:${UI_PORT}
  API:   http://localhost:${API_PORT}/api/v1/health
  Neo4j: http://localhost:7474  (user: neo4j, password: see .env)

Manage with:
  cd ${INSTALL_DIR}
  ${RUNTIME} compose -f compose.prod.yml logs -f
  ${RUNTIME} compose -f compose.prod.yml down

EOF
