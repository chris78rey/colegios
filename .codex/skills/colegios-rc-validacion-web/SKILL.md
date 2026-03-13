---
name: colegios-rc-validacion-web
description: Runbook for the web admin identity validation flow in colegios. Use when implementing or modifying cedula-based external validation, corrected Excel download, standard 12-column signer sheets, or OmniSwitch preflight checks in the web admin/API.
---

# Colegios RC Validacion Web

## Purpose
Use this skill for the web admin flow that:
- uploads an Excel
- validates rows by `Cedula`
- compares identity fields against an external source (currently API-side mock)
- evaluates OmniSwitch readiness fields
- generates a corrected `.xlsx` copy with audit columns

Main files:
- `web/admin/cedulas-validacion.html`
- `services/api/src/index.js`

## Use This When
- The user asks for Registro Civil / QueryRC style validation in the web admin.
- The task involves downloading a validated or corrected Excel.
- You need to adjust accepted Excel headers for signer identity.
- You need to add preflight checks before OmniSwitch send.

## Standard Excel Contract
- Treat this 12-column layout as the primary contract:
  - `Cedula`
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`
  - `Celular`
  - `Email`
  - `FirmaPrincipal`
  - `IdPais`
  - `IdProvincia`
  - `IdCiudad`
  - `Direccion`
- Build the comparison full name from:
  - `PrimerNombre + SegunNombre + PrimerApellido + SegApellido`
- Keep flexible header detection only as fallback for legacy files. Do not make fallback aliases the preferred path.

## Current API Pattern
- Endpoint to run validation:
  - `POST /v1/rc-validations/run`
- Endpoint to fetch a previous run:
  - `GET /v1/rc-validations/:id?organizationId=...`
- Endpoint to download corrected Excel:
  - `GET /v1/rc-validations/:id/download?organizationId=...`

### Current processing rules
- Request is `multipart/form-data`.
- Required fields:
  - `organizationId`
  - `excel`
- Optional flags:
  - `compareNames`
  - `compareLastNames`
  - `createCorrectedCopy`
- Output is persisted under:
  - `storage/rc-validations/<organizationId>/<runId>/`

## Current Result Model
- Identity comparison statuses:
  - `MATCH`
  - `CORRECTABLE`
  - `REVIEW`
  - `ERROR`
- Every row also carries OmniSwitch readiness:
  - `omniReady`
  - `omniIssues[]`
- The UI must show both:
  - identity status
  - OmniSwitch checklist result

## Corrected Excel Rules
- Never mutate the uploaded source file in place.
- Always generate a corrected copy.
- Always append audit columns:
  - `nombre_completo_original`
  - `nombre_completo_validado`
  - `estado_validacion`
  - `observacion_validacion`
- If a row is `CORRECTABLE` and copy generation is enabled:
  - update the corrected copy
  - split official names back into the standard columns when available

## OmniSwitch Preflight Rules
- Identity validation is not enough; preflight check these fields too:
  - `Celular`
  - `Email`
  - `Direccion`
  - `FirmaPrincipal`
  - `IdPais`
  - `IdProvincia`
  - `IdCiudad`
- Current checks:
  - phone sanitized to digits
  - phone minimum usable length
  - email presence and basic format
  - address presence
  - `FirmaPrincipal` recognizable
  - location IDs numeric and positive
- If identity matches but OmniSwitch fields fail, keep the row visible as valid identity but not ready for send.

## Error Handling Pattern
- Prefer explicit user-facing API errors over generic network failures.
- In the web page:
  - do not assume every response is JSON
  - parse response text defensively
  - surface backend `detail` when present
- In the API:
  - reject missing org/file with `400`
  - reject unknown organization with `404`
  - reject unreadable/unsupported Excel structure with clear error text

## Web Admin Pattern
- `apiBase` must target the API service, not blindly reuse the web origin.
- When served from `:5173`, point API requests to `:8080`.
- Keep the page navigable from:
  - `upload.html`
  - `history.html`
  - `signing.html`

## Architecture Rule
- Keep external identity logic in API, not in the static frontend.
- The current provider response is simulated in API to validate the workflow.
- When replacing mock with real provider integration:
  - preserve the normalized result contract
  - do not break the web page shape
  - keep corrected Excel generation unchanged

## If You Extend This Flow
- If the user asks for persistence/history beyond file storage, then consider DB modeling.
- If DB changes are needed, also use `colegios-db-evolution`.
- If the validated rows feed OmniSwitch send rules, also use `colegios-omniswitch-envio`.
