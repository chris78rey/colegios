#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

compose ps
printf '\n'
info "Resumen de salud"
for svc in api worker web postgres redis; do
  cid="$(service_container "$svc" || true)"
  if [[ -z "$cid" ]]; then
    printf '%-10s %s\n' "$svc" "NO CREADO"
    continue
  fi
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$cid")"
  state="$(docker inspect -f '{{.State.Status}}' "$cid")"
  restarts="$(docker inspect -f '{{.RestartCount}}' "$cid")"
  printf '%-10s state=%-10s health=%-10s restarts=%s\n' "$svc" "$state" "$health" "$restarts"
done
