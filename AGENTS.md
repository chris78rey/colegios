# Repository Guidelines

## Project Structure & Module Organization
- `web/`: Static frontend (login, admin, superadmin pages). Served by nginx in compose.
- `services/api/`: Node.js ESM API. Entry: `services/api/src/index.js`. Prisma schema in `services/api/prisma/schema.prisma`.
- `services/worker/`: Background worker service (ESM).
- `data/`: Persistent storage (Postgres data and uploaded files). Do not commit.
- `plantillas/`: Reference templates used by the UI and examples.
- `docs/`, `scripts/`: Documentation and utilities (e.g., `scripts/healthcheck.sh`).

## Build, Test, and Development Commands
- `docker compose up --build`: Build and run `api`, `worker`, `web`, `postgres`, `redis`.
- `docker compose up -d postgres redis`: Start only databases.
- `docker compose up -d --build api worker`: Rebuild backend services.
- `docker compose logs -f api`: Follow API logs.
- `scripts/healthcheck.sh`: Basic service health check.
- `npm install` then `npm run dev`: Run a service locally (inside `services/api` or `services/worker`).

## Coding Style & Naming Conventions
- ESM modules, 2-space indentation, double quotes, semicolons.
- All HTTP routes are versioned under `/v1/...`.
- Use `status` fields for soft deletes (e.g., `active`/`inactive`) instead of hard deletes.
- Keep Prisma model names singular (`Organization`, `User`, `Template`).

## Testing Guidelines
- No automated tests yet. If you add tests, include `npm run test` and document the framework here.
- Manual checks: login flow, superadmin management, desktop upload to API, admin history/preview.

## Commit & Pull Request Guidelines
- Existing commits use short imperative summaries: `Add ...`, `Fix ...`, `Update ...`.
- PRs should include: purpose, verification steps (commands + expected result), and screenshots for UI changes.

## Configuration & Data
- Use `.env` for local overrides; never commit secrets.
- Compose defines `DATABASE_URL`, `REDIS_URL`, `STORAGE_PATH`.
- Local web runs at `http://localhost:5173` when using compose.

## Skills
### Available skills
- colegios-db-evolution: Database evolution runbook for the colegios project. Use when changing Prisma models, adding fields, introducing new tables, or adjusting relationships to ensure additive migrations, data preservation, and a persistent change log from local development. (file: G:/codex_projects/colegios/.codex/skills/colegios-db-evolution/SKILL.md)
- colegios-lessons-learned: Runbook for Colegio MVP lessons learned. Use when setting up local Docker Compose, fixing Prisma/openssl in containers, generating migrations/seed data, or deploying on VPS/Coolify with Traefik labels and network configuration. (file: G:/codex_projects/colegios/.codex/skills/colegios-lessons-learned/SKILL.md)
- colegios-omniswitch-envio: Envio de PDFs por registro del Excel hacia OmniSwitch/Firmalo con el flujo de 4 pasos (crear solicitud, cargar documento, registrar firmante, disparar envio). Usar cuando se necesite integrar el pipeline de firma en el proyecto colegios, especialmente al procesar lotes y generar un envio por cada request. (file: G:/codex_projects/colegios/.codex/skills/colegios-omniswitch-envio/SKILL.md)
- colegios-desktop-local-pdf: Runbook for the local PySide6 desktop app in colegios. Use when extending the desktop operator workflow, generating PDFs locally from Excel plus multiple templates, simplifying UX for non-technical users, or preparing future upload and OmniSwitch integration from a local batch manifest. (file: G:/codex_projects/colegios/.codex/skills/colegios-desktop-local-pdf/SKILL.md)
- colegios-desktop-web-history: Runbook for the desktop-to-web handoff in colegios. Use when maintaining imported desktop batches, direct-open from desktop, or the admin history UI for uploaded PDFs. (file: G:/codex_projects/colegios/.codex/skills/colegios-desktop-web-history/SKILL.md)
- colegios-template-groups: Runbook for multi-template groups (max 4) in colegios: DB models, API endpoints, UI flow, and batch processing. (file: G:/codex_projects/colegios/.codex/skills/colegios-template-groups/SKILL.md)
- colegios-templates-excel-pdf: Runbook for template ingestion (DOCX/HTML), Excel header generation, and file linking in colegios. (file: G:/codex_projects/colegios/.codex/skills/colegios-templates-excel-pdf/SKILL.md)
