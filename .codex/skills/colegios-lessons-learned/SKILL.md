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
  - `http://localhost:5173/admin/history.html?debug=1`

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
  - `ADMIN` → `/admin/history.html`
  - `SUPER_ADMIN` → `/superadmin/index.html`
- API base for frontend:
  - Use `http://localhost:8080` when on localhost.
  - Otherwise use `window.location.origin`.

## Current Product Split
- Desktop app is the primary operational flow:
  - select local HTML templates
  - load Excel
  - generate PDFs locally
  - upload ready documents to the API
- Web admin is now consultation-first:
  - review imported desktop batches
  - inspect document metadata
  - preview/download PDFs
- Keep `web/admin/upload.html` only as a transition page for legacy links; do not rebuild the old operational wizard there unless requested explicitly.

## Desktop Batch Import Lessons
- Normalize Windows paths before extracting `basename` on the API side; imported desktop manifests may contain backslashes in `pdf_path`.
- Persist and reuse `rowJson` from imported documents to enrich the web UI without another transformation layer.
- When import fails, return and surface actionable backend detail (`missing_pdf_file`, `no_ready_documents`, etc.).

## Desktop-to-Web Access Pattern
- If the desktop app needs to open the web without asking the user to log in again, use a short-lived signed token.
- Current flow:
  - desktop calls `POST /v1/auth/desktop-web-link`
  - API validates credentials and optional batch ownership
  - API returns a URL to `history.html` with `autoLoginToken` and optional `batchId`
  - web consumes it via `POST /v1/auth/desktop-token/consume`
- Never place raw credentials in the browser URL or rely on blindly shared localStorage state.

## History UX Pattern
- Default the admin history to the latest uploaded desktop batch.
- Let the operator expand to all batches only when needed.
- Show signer identity from row fields (`PrimerNombre`, `SegunNombre`, `PrimerApellido`, `SegApellido`) in the selected batch detail and document search.
- Keep `history.html` consultation-only:
  - compact numeric list/table of batches
  - click on row or numeric index opens batch detail in a modal
  - do not keep large embedded detail panes in the main page
- Use PDF modal preview as an on-demand action, not as a permanently embedded panel when the user asks for a cleaner UI.

## OmniSwitch Pattern
- The signing pipeline is grouped by Excel row:
  - `1 fila = 1 solicitud`
  - `N PDFs de esa fila = N documentos en la misma `IDSolicitud``
- In local development, prefer `OMNISWITCH_MODE=mock` because the real provider may reject requests by public IP whitelist.
- Treat OmniSwitch functional failures by inspecting `resultCode`, not only HTTP status.
- Reserve `real` mode for environments whose public IP is authorized by the provider.
- Poll by `IDSolicitud`, but resolve progress per document using the provider array response and `DocFirmado`.
- Keep `NombreDocumento` unique inside each request and use `DocAFirmar` as the canonical download key.
- Do not assume provider idempotency; protect duplicate sends and duplicate signatory registration on our side.
- `SENT` is only the initial local/provider-send state:
  - in `mock`, it changes only after `mock-sign` or auto-sign
  - in `real`, it changes only after polling `GetSolicitudByID`
- Treat `IdPais`, `IdProvincia` and `IdCiudad` as provider catalog IDs; for the validated Ecuador flow, the working defaults are `19`, `17`, `1701`.
- `QueryRC` is a separate identity-validation stage, not a substitute for the document-signature flow itself.
- `Cedula` alone means demographic validation; `Cedula + CodigoDactilar` means biometric validation.
- If `Celular` and `Email` are sent to `QueryRC`, the provider may also emit a signed data-acceptance document.
- For signer-paid flows, `PaymentRequired` is not just a boolean idea:
  - institution pays: `PaymentRequired=0`, `amount=0`
  - signer pays: store and send an operational payment reference plus the exact amount
- In current operator UX, duplicate warnings matter only for `Cedula`; do not block or warn by duplicated email/cellular unless product rules change.

## Signing UX Pattern
- Keep signing as a single operational page (`signing.html`) focused on blocks/rows, not individual PDFs.
- Each block means:
  - 1 Excel row
  - 1 Omni request
  - N PDFs behind the scenes
- The page should show:
  - firmante
  - estado
  - alertas
  - acciones de envio/actualizacion
- The first PDF is only a visual reference:
  - open it in a modal on demand
  - do not keep a fixed embedded iframe if the user asks for a simpler screen

## Control Mode
- Always execute OS-level commands directly when possible (docker, git, logs, health checks).
- If the environment is not in full-control mode or lacks permissions, explicitly say so before giving instructions.

## References
- Detailed notes: `references/lessons.md`
- Operación Compose VPS estandarizada: `../colegios-ops-compose-vps/SKILL.md`
