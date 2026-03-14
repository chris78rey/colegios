#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

if ! is_service_running worker; then
  err "Servicio worker no esta corriendo"
  exit 51
fi
compose exec worker sh
