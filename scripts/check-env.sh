#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/env/.env}"
EXAMPLE_FILE="$ROOT_DIR/env/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] Falta $ENV_FILE"
  echo "Copie env/.env.example a env/.env"
  exit 2
fi

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "[ERROR] Falta $EXAMPLE_FILE"
  exit 3
fi

missing=0
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  value="$(grep -E "^${key}=" "$ENV_FILE" || true)"
  if [[ -z "$value" ]]; then
    echo "[ERROR] Variable faltante: $key"
    missing=1
    continue
  fi
  current="${value#*=}"
  if [[ -z "$current" ]]; then
    echo "[ERROR] Variable vacia: $key"
    missing=1
  fi
done < "$EXAMPLE_FILE"

if [[ "$missing" -ne 0 ]]; then
  echo "[ERROR] Validacion de entorno fallida"
  exit 10
fi

echo "[OK] Variables de entorno completas"
