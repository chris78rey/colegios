#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

for d in data/postgres data/redis data/storage backups logs; do
  p="$ROOT_DIR/$d"
  if [[ ! -d "$p" ]]; then
    echo "[ERROR] No existe $p"
    exit 40
  fi
  echo "[INFO] $d"
  du -sh "$p"
done

echo "[OK] Volumenes verificados"
