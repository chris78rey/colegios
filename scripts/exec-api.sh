#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

if ! is_service_running api; then
  err "Servicio api no esta corriendo"
  exit 50
fi
compose exec api sh
