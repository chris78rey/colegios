---
name: colegios-lessons-learned
description: Runbook for Colegio MVP lessons learned. Use when setting up local Docker Compose, fixing Prisma/openssl in containers, generating migrations/seed data, or deploying on VPS/Coolify with Traefik labels and network configuration.
---

# Colegios Lessons Learned

## Overview
Use this skill to repeat the working setup: local compose with web + api + worker, Prisma migrations/seed, and Coolify/VPS deployment details (networks, env vars, and OpenSSL fixes).

## Workflow (quick)
1. Local compose: ensure `.env` sets local network flags and expose ports via `docker-compose.override.yml`.
2. Prisma: rely on Debian-based API image to avoid OpenSSL issues; run `migrate deploy` + `seed` at container start.
3. VPS/Coolify: set `DOMAIN` + `CLIENT_ID`, ensure external network name exists, deploy API and web.
4. OS actions: run needed system commands yourself; if not in full control, state it explicitly before giving steps.
5. UI debug: use `?debug=1` to surface browser errors without DevTools.

## Local Development Checklist
- Create `.env` in repo root:
  - `CLIENT_ID=local`
  - `DOMAIN=local.test`
  - `COOLIFY_EXTERNAL_NETWORK=false`
  - `COOLIFY_NETWORK_NAME=coolify`
- Create `docker-compose.override.yml` to publish ports for local health checks:
  - API `8080:8080`, Worker `8081:8081`, Postgres `5432:5432`, Redis `6379:6379`
- Run `docker compose up --build`.
- Verify:
  - `http://localhost:5173`
  - `http://localhost:8080/health`
  - `http://localhost:8081/health`
- Debug overlay:
  - `http://localhost:5173/?debug=1`
  - `http://localhost:5173/superadmin/index.html?debug=1`
  - `http://localhost:5173/admin/upload.html?debug=1`

## Prisma + Seed
- The API container runs:
  - `npx prisma migrate deploy`
  - `node scripts/seed.js`
- If schema changes, create migration locally and commit `prisma/migrations/`.
- Seed is idempotent (safe to run on every start).

## VPS/Coolify Notes
- `docker-compose.yml` uses Traefik labels; set these in the VPS env:
  - `DOMAIN=firma.da-tica.com`
  - `CLIENT_ID=firma`
- Network config in compose:
  - `COOLIFY_EXTERNAL_NETWORK=true`
  - `COOLIFY_NETWORK_NAME=coolify`
- API image must be Debian-based (`node:20-bullseye-slim`) for Prisma OpenSSL.

## Recent Patterns (Auth + UI)
- Login is email+password only; RUC removed from UI.
- Store `auth_email`, `auth_role`, and optional `auth_org_id` in localStorage.
- Redirect by role:
  - `ADMIN` → `/admin/upload.html`
  - `SUPER_ADMIN` → `/superadmin/index.html`
- API base for frontend:
  - Use `http://localhost:8080` when on localhost.
  - Otherwise use `window.location.origin`.

## Control Mode
- Always execute OS-level commands directly when possible (docker, git, logs, health checks).
- If the environment is not in full-control mode or lacks permissions, explicitly say so before giving instructions.

## References
- Detailed notes: `references/lessons.md`
