#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

service="${1:-}"
if [[ -n "$service" ]]; then
  info "Mostrando ultimas 200 lineas de $service"
  compose logs --tail 200 "$service"
else
  info "Mostrando ultimas 200 lineas de todos los servicios"
  compose logs --tail 200
fi
