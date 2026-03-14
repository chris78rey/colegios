#!/usr/bin/env bash
set -euo pipefail

threshold="${1:-85}"
mem_line="$(free -m | awk 'NR==2 {print $2" "$3}')"
total="${mem_line%% *}"
used="${mem_line##* }"
percent=$(( used * 100 / total ))

echo "[INFO] RAM usada: ${used}MB / ${total}MB (${percent}%)"
free -m

if [[ "$percent" -ge "$threshold" ]]; then
  echo "[ERROR] RAM por encima del umbral (${threshold}%)"
  exit 21
fi

echo "[OK] RAM dentro del umbral"
