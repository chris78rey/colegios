#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

info "Redes Docker"
docker network ls
printf '\n'

for net in "${COMPOSE_PROJECT_NAME:-colegios_ops}_internal" "${TRAEFIK_DOCKER_NETWORK:-coolify}"; do
  if docker network inspect "$net" >/dev/null 2>&1; then
    info "Inspect red: $net"
    docker network inspect "$net" --format 'name={{.Name}} containers={{len .Containers}} internal={{.Internal}}'
  else
    warn "Red no encontrada: $net"
  fi
done
