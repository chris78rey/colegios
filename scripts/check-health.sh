#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

fail=0
check() {
  local name="$1"
  local url="$2"
  if curl -fsS "$url" >/dev/null; then
    echo "[OK] $name -> $url"
  else
    echo "[ERROR] $name -> $url"
    fail=1
  fi
}

require_cmd curl
check "api-health" "http://127.0.0.1:${API_HOST_PORT:-8080}/health"
check "api-ready" "http://127.0.0.1:${API_HOST_PORT:-8080}/ready"
check "api-version" "http://127.0.0.1:${API_HOST_PORT:-8080}/version"
check "worker-health" "http://127.0.0.1:${WORKER_HOST_PORT:-8081}/health"
check "worker-ready" "http://127.0.0.1:${WORKER_HOST_PORT:-8081}/ready"
check "worker-version" "http://127.0.0.1:${WORKER_HOST_PORT:-8081}/version"
check "web" "http://127.0.0.1:${WEB_HOST_PORT:-5173}/"

for svc in api worker web postgres redis; do
  cid="$(service_container "$svc" || true)"
  if [[ -z "$cid" ]]; then
    echo "[ERROR] $svc sin contenedor"
    fail=1
    continue
  fi
  state="$(docker inspect -f '{{.State.Status}}' "$cid")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$cid")"
  echo "[INFO] $svc state=$state health=$health"
  if [[ "$state" != "running" ]]; then
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "[ERROR] Healthcheck general con fallos"
  exit 30
fi

echo "[OK] Healthcheck general exitoso"
