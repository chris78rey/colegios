# Colegios Lessons Learned (Detailed)

## 1) Local Compose Gotchas
- `docker-compose.yml` is Coolify-first (external network). Local requires override + env flags.
- Use `.env` with:
  - `COOLIFY_EXTERNAL_NETWORK=false`
  - `COOLIFY_NETWORK_NAME=coolify` (unused when external false)
  - `CLIENT_ID=local`, `DOMAIN=local.test`
- Local health checks need `docker-compose.override.yml` to publish ports.
- Example override:
  ```yaml
  services:
    api:
      ports: ["8080:8080"]
    worker:
      ports: ["8081:8081"]
    postgres:
      ports: ["5432:5432"]
    redis:
      ports: ["6379:6379"]
  ```

## 2) Prisma / OpenSSL
- Alpine images lack libssl for Prisma schema engine.
- Fix: use `node:20-bullseye-slim` in `services/api/Dockerfile`.
- Container runs:
  - `npx prisma generate` (build)
  - `npx prisma migrate deploy` + `node scripts/seed.js` (start)

## 3) Migrations and Seed
- Always commit `prisma/migrations/*`.
- Seed in `services/api/scripts/seed.js` is idempotent.
- Initial seed creates:
  - 2 organizations, 3 users, 2 templates, 2 credits, 4 requests, 4 signatories, 4 events.

## 4) Coolify / Traefik
- `DOMAIN` + `CLIENT_ID` required for router labels.
- Ensure external network exists (default `coolify`).
- When local: set `COOLIFY_EXTERNAL_NETWORK=false` to let compose create networks.

## 5) Runtime Checks
- Web: `http://localhost:5173`
- API: `http://localhost:8080/health`
- Worker: `http://localhost:8081/health`
- Postgres sanity:
  - `select count(*) from "Organization";`

## 6) Control Mode Guidance
- Prefer running OS-level commands directly (docker, git, logs, health checks).
- If full-control mode is not available, state the limitation explicitly before providing steps.

## 7) UI Debug Overlay
- Add `?debug=1` to any UI route to show JS errors on screen (no console).
- Use when buttons appear to do nothing; messages are displayed in-page.

## 8) Template Upload Flow
- Admin uploads `.docx` → backend extracts `{{placeholders}}` and stores in Template.
- Endpoint: `POST /v1/templates` (multipart: `organizationId`, `name`, `file`).
- List templates by org: `GET /v1/templates?organizationId=<id>&role=ADMIN`.

## 9) CORS Methods
- If UI buttons do nothing, check CORS.
- Ensure backend allows `PATCH` and `DELETE` in `access-control-allow-methods`.
