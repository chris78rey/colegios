#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://firma.da-tica.com}"

echo "Using BASE_URL=${BASE_URL}"

echo "==> GET /health"
curl -fsS "${BASE_URL}/health" | sed 's/.*/OK: &/'

echo "==> GET /v1/requests"
curl -fsS "${BASE_URL}/v1/requests" | sed 's/.*/OK: &/'

echo "==> POST /v1/uploads/excel"
# Placeholder request; API returns 202 with not_implemented payload
curl -fsS -X POST "${BASE_URL}/v1/uploads/excel" -H "content-type: application/json" -d '{}' | sed 's/.*/OK: &/'

echo "All checks passed."
