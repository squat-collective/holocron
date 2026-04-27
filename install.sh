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
# Update an existing install (refreshes compose.prod.yml + .env.example,
# merges new env keys non-destructively, bumps HOLOCRON_VERSION, then
# pulls + restarts):
#   curl -fsSL https://github.com/squat-collective/holocron/releases/latest/download/install.sh \
#     | bash -s -- --update
#
# Add --backup to dump the Neo4j volume to a tarball before pulling.
set -euo pipefail

REPO="${HOLOCRON_REPO:-squat-collective/holocron}"
VERSION="${HOLOCRON_VERSION:-latest}"
INSTALL_DIR="${HOLOCRON_DIR:-$PWD/holocron}"
UPDATE_MODE="${HOLOCRON_UPDATE:-0}"
BACKUP="${HOLOCRON_BACKUP:-0}"

# --- Args ---

while [ "$#" -gt 0 ]; do
	case "$1" in
		--update|-u) UPDATE_MODE=1 ;;
		--backup|-b) BACKUP=1 ;;
		--dir) INSTALL_DIR="$2"; shift ;;
		--version) VERSION="$2"; shift ;;
		-h|--help)
			sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*) printf 'unknown arg: %s\n' "$1" >&2; exit 2 ;;
	esac
	shift
done

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

if [ "$UPDATE_MODE" = "1" ]; then
	log "Updating Holocron in ${INSTALL_DIR} → ${VERSION}"
else
	log "Installing Holocron ${VERSION} into ${INSTALL_DIR}"
fi

# Update mode requires an existing install — bail early with a clear message
# instead of silently treating it as a fresh install.
if [ "$UPDATE_MODE" = "1" ]; then
	if [ ! -f "$INSTALL_DIR/compose.prod.yml" ]; then
		die "no existing install at $INSTALL_DIR (compose.prod.yml missing). Drop --update for a fresh install."
	fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# --- Download compose + env template ---

# GitHub release assets can't have leading dots, so .env.example is
# uploaded as `env.example` and downloaded as `.env.example` locally.
#
# Fresh install: keep an existing local file (idempotent re-run).
# Update: back up the local file with a timestamp suffix and pull a
# fresh copy so structural changes (new services, env keys, healthchecks)
# actually land.
fetch() {
	local remote="$1"
	local local_name="${2:-$1}"
	if [ -f "$local_name" ]; then
		if [ "$UPDATE_MODE" = "1" ]; then
			cp "$local_name" "${local_name}.${TIMESTAMP}.bak"
			curl -fsSL "${BASE_URL}/${remote}" -o "$local_name"
			ok "refreshed $local_name (previous → ${local_name}.${TIMESTAMP}.bak)"
		else
			warn "$local_name exists — keeping local copy"
		fi
	else
		curl -fsSL "${BASE_URL}/${remote}" -o "$local_name"
		ok "downloaded $local_name"
	fi
}

fetch compose.prod.yml
fetch env.example .env.example

# --- Generate or update .env ---

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
elif [ "$UPDATE_MODE" = "1" ]; then
	# Non-destructive merge: append every key from the new .env.example
	# that isn't already present. User-edited values are never touched.
	added=0
	new_block=""
	while IFS= read -r line; do
		case "$line" in
			''|'#'*) continue ;;
		esac
		key="${line%%=*}"
		case "$key" in
			*[!A-Z0-9_]*) continue ;;
		esac
		if ! grep -qE "^${key}=" .env; then
			new_block+="${line}"$'\n'
			added=$((added + 1))
		fi
	done < .env.example
	if [ "$added" -gt 0 ]; then
		cp .env ".env.${TIMESTAMP}.bak"
		{
			printf '\n# === Added by upgrade %s ===\n' "$TIMESTAMP"
			printf '%s' "$new_block"
		} >> .env
		ok "merged $added new key(s) into .env (previous → .env.${TIMESTAMP}.bak)"
	fi
	# Bump HOLOCRON_VERSION so `compose pull` actually fetches the
	# release the user asked for. Keep a single backup per run — the
	# merge step above already made one if it ran.
	if grep -qE '^HOLOCRON_VERSION=' .env; then
		[ -f ".env.${TIMESTAMP}.bak" ] || cp .env ".env.${TIMESTAMP}.bak"
		# BSD sed (macOS) needs an explicit suffix for -i; use a temp
		# file so the script stays portable.
		tmp_env="$(mktemp)"
		sed "s|^HOLOCRON_VERSION=.*|HOLOCRON_VERSION=${VERSION}|" .env > "$tmp_env"
		mv "$tmp_env" .env
		chmod 600 .env
		ok "set HOLOCRON_VERSION=${VERSION} in .env"
	fi
else
	warn ".env exists — keeping it. Delete it to regenerate, or re-run with --update to merge new keys."
fi

# --- Optional Neo4j backup ---

# Tar the named volume's filesystem via a throwaway helper container so
# we don't need to know the runtime's volume-on-host path. We stop the
# stack first to ensure on-disk consistency: Neo4j Community can't do a
# live dump without quiescing writes. ~30s of downtime in exchange for
# a restore-able snapshot is the right tradeoff during an upgrade.
if [ "$BACKUP" = "1" ]; then
	BACKUP_FILE="neo4j-backup-${TIMESTAMP}.tar.gz"
	log "Backing up Neo4j volume → ${BACKUP_FILE}"
	$RUNTIME compose -f compose.prod.yml stop neo4j >/dev/null
	$RUNTIME run --rm \
		-v holocron_neo4j_data:/data:ro \
		-v "$(pwd)":/backup \
		alpine:3 \
		tar czf "/backup/${BACKUP_FILE}" -C /data .
	$RUNTIME compose -f compose.prod.yml start neo4j >/dev/null
	ok "backup written: ${BACKUP_FILE}"
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

if [ "$UPDATE_MODE" = "1" ]; then
	cat <<EOF

${c_green}Holocron updated to ${VERSION}.${c_reset}

  UI:    http://localhost:${UI_PORT}
  API:   http://localhost:${API_PORT}/api/v1/health
  Neo4j: http://localhost:7474  (user: neo4j, password: see .env)

Backups (this run, if any):
  ls ${INSTALL_DIR}/*.${TIMESTAMP}.bak ${INSTALL_DIR}/neo4j-backup-${TIMESTAMP}.tar.gz 2>/dev/null

EOF
else
	cat <<EOF

${c_green}Holocron is up.${c_reset}

  UI:    http://localhost:${UI_PORT}
  API:   http://localhost:${API_PORT}/api/v1/health
  Neo4j: http://localhost:7474  (user: neo4j, password: see .env)

Manage with:
  cd ${INSTALL_DIR}
  ${RUNTIME} compose -f compose.prod.yml logs -f
  ${RUNTIME} compose -f compose.prod.yml down

Update later:
  curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | bash -s -- --update

EOF
fi
