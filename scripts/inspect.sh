#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

service="${1:-api}"
cid="$(service_container "$service" || true)"
if [[ -z "$cid" ]]; then
  err "Servicio no encontrado: $service"
  exit 4
fi

info "Inspeccionando $service ($cid)"
docker inspect "$cid"
