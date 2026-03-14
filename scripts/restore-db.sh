#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

file="${1:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  err "Uso: $0 /ruta/backup.sql.gz"
  exit 60
fi

warn "Se restaurara la base completa desde: $file"
warn "Operacion destructiva sobre datos actuales"
read -r -p "Escriba RESTORE para continuar: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  err "Restauracion cancelada"
  exit 61
fi

info "Restaurando backup"
gzip -dc "$file" | compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
info "Restauracion completada"
