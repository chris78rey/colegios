#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

backup_dir="${1:-$ROOT_DIR/backups}"
mkdir -p "$backup_dir"
timestamp="$(date +%Y%m%d_%H%M%S)"
out="$backup_dir/postgres_${timestamp}.sql.gz"

info "Generando backup de postgres en $out"
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$out"
info "Backup completado"
ls -lh "$out"
