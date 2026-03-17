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
- Canonical deploy file is `compose/compose.yml`.
- Current production domain model is single-host:
  - web on `/`
  - api on `/v1`
- Ensure external network exists (default `coolify`).
- When local: set `COOLIFY_EXTERNAL_NETWORK=false` to let compose create networks.
- On this VPS, `coolify-proxy` exposes entrypoints `http` and `https`, not `web` and `websecure`.
- If router labels still show `${...}` literals after deploy, hardcode the Traefik labels for the real production domain.

## 5) Coolify Static Web Packaging
- Bind mounting `./web` into nginx can fail under Coolify even when the repo contains `index.html`.
- Symptom:
  - nginx returns `403 directory index forbidden`
  - local host port answers `403`
- Fix:
  - add `web/Dockerfile`
  - build the web image
  - remove the static bind mount from the service

## 6) Runtime Checks
- Web: `http://localhost:5173`
- API: `http://localhost:8080/health`
- Worker: `http://localhost:8081/health`
- Postgres sanity:
  - `select count(*) from "Organization";`

## 7) Coolify Network Resolution Gotchas
- Generic aliases such as `postgres`, `db`, `redis`, `cache` can resolve through the wrong Docker network when services are attached to multiple networks.
- Use unique internal aliases:
  - `colegios-db`
  - `colegios-cache`
- Validate with:
  - `docker exec <container> getent hosts colegios-db`
  - `docker exec <container> getent hosts colegios-cache`

## 8) API Startup Races
- A manual `prisma migrate deploy` can succeed while the real API container still fails during boot if the dependency is not ready at the exact startup moment.
- Wrap startup with retries before concluding that the credentials are wrong.
- Current pattern:
  - retry `npx prisma migrate deploy`
  - run `node scripts/seed.js`
  - start `node src/index.js`

## 9) Control Mode Guidance
- Prefer running OS-level commands directly (docker, git, logs, health checks).
- If full-control mode is not available, state the limitation explicitly before providing steps.

## 10) UI Debug Overlay
- Add `?debug=1` to any UI route to show JS errors on screen (no console).
- Use when buttons appear to do nothing; messages are displayed in-page.

## 11) Template Upload Flow
- Admin uploads `.docx` → backend extracts `{{placeholders}}` and stores in Template.
- Endpoint: `POST /v1/templates` (multipart: `organizationId`, `name`, `file`).
- List templates by org: `GET /v1/templates?organizationId=<id>&role=ADMIN`.

## 12) CORS Methods
- If UI buttons do nothing, check CORS.
- Ensure backend allows `PATCH` and `DELETE` in `access-control-allow-methods`.
