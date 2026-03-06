#!/usr/bin/env bash
set -euo pipefail

check() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  if [ "$code" != "200" ]; then
    echo "FAIL $name $url -> $code"
    exit 1
  fi
  echo "OK   $name $url"
}

check "api" "http://127.0.0.1:8080/health"
check "worker" "http://127.0.0.1:8081/health"
