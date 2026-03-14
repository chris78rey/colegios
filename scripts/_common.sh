#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/compose/compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/env/.env}"

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
err() { printf '[ERROR] %s\n' "$*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Comando requerido no encontrado: $1"
    exit 127
  fi
}

ensure_files() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    err "No existe compose file: $COMPOSE_FILE"
    exit 2
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    err "No existe archivo de entorno: $ENV_FILE"
    err "Creelo desde env/.env.example"
    exit 3
  fi
}

compose() {
  require_cmd docker
  ensure_files
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

service_container() {
  local service="$1"
  compose ps -q "$service"
}

is_service_running() {
  local service="$1"
  local cid
  cid="$(service_container "$service")"
  [[ -n "$cid" ]] || return 1
  local state
  state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
  [[ "$state" == "running" ]]
}
