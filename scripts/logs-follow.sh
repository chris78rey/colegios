#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

service="${1:-}"
if [[ -n "$service" ]]; then
  info "Siguiendo logs de $service"
  compose logs -f --tail 200 "$service"
else
  info "Siguiendo logs de todos los servicios"
  compose logs -f --tail 200
fi
