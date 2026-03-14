#!/usr/bin/env bash
set -euo pipefail

threshold="${1:-85}"
usage="$(df -h / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
echo "[INFO] Uso de disco en /: ${usage}%"

df -h

if [[ "$usage" -ge "$threshold" ]]; then
  echo "[ERROR] Disco por encima del umbral (${threshold}%)"
  exit 20
fi

echo "[OK] Disco dentro del umbral"
