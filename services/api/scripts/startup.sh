#!/usr/bin/env sh
set -eu

max_attempts="${PRISMA_MIGRATE_MAX_ATTEMPTS:-20}"
sleep_seconds="${PRISMA_MIGRATE_RETRY_DELAY_SECONDS:-5}"
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  echo "[startup] Running prisma migrate deploy (attempt ${attempt}/${max_attempts})"
  if npx prisma migrate deploy; then
    echo "[startup] Prisma migrations applied"
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "[startup] Prisma migrate failed after ${max_attempts} attempts" >&2
    exit 1
  fi

  echo "[startup] Prisma migrate failed, retrying in ${sleep_seconds}s"
  sleep "$sleep_seconds"
  attempt=$((attempt + 1))
done

echo "[startup] Seeding base data"
node scripts/seed.js

echo "[startup] Starting API"
exec node src/index.js
