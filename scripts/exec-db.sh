#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

if ! is_service_running postgres; then
  err "Servicio postgres no esta corriendo"
  exit 52
fi
compose exec postgres sh
