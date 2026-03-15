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
- Identity validation now hits the real Registro Civil API (OmniSwitch `QueryRC`).
- The call is done over a server-to-server proxy pattern (`fetchQueryRC`) to bypass frontend CORS and IP whitelist restrictions.
- Identity comparison statuses:
  - `MATCH` (API call succeeded and returned data)
  - `ERROR` (API call failed or Cedula not found)
- Every row also carries OmniSwitch readiness:
  - `omniReady`
  - `omniIssues[]`
- The API result includes demographic data extracted from RC:
  - `rcData.profesion`
  - `rcData.estadoCivil`
  - `rcData.nacionalidad`
- The UI must show both:
  - extracted real name and demographics
  - OmniSwitch checklist result

## Corrected Excel Rules
- Never mutate the uploaded source file in place.
- Always generate a corrected copy and process it asynchronously.
- Note on Array Offset: When inserting data into the output worksheet (`correctedMatrix`), use `matrixIndex = rowOffset + 1` (since index 0 is the header). Do NOT use `excelRowNumber` (which is `rowOffset + 2`) for array insertion to avoid off-by-one desynchronization!
- Always append these audit columns containing real RC data:
  - `nombre_completo_validado`
  - `estado_validacion`
  - `observacion_validacion`
  - `PrimerNombre_RC`
  - `Apellidos_RC`
  - `Profesion`
  - `EstadoCivil`
  - `Nacionalidad`
- If a row is a `MATCH`:
  - forcefully inject the official RC names back into the standard name columns of the Excel.
  - populate the demographic audit columns.
- If a row is an `ERROR`:
  - demographic columns must remain blank to avoid polluting the output.

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
  - intercept RC proxy errors and return graceful `ERROR` statuses per row rather than crashing the loop.

## Web Admin Pattern
- `apiBase` must target the API service, not blindly reuse the web origin.
- When served from `:5173`, point API requests to `:8080`.
- The Cedula validation UI must remain simple, highlighting extracted demographics without redundant "compare options".

## Architecture Rule
- External identity logic lives tightly in the backend API.
- We act as a middleman Proxy to OmniSwitch.
- Do not expose the real OmniSwitch provider credentials to the frontend.
- Rely on the `detectRcColumns` fuzzy-match utility to capture incoming Cedula columns regardless of typos in their headers.

## If You Extend This Flow
- If the user asks for persistence/history beyond file storage, then consider DB modeling.
- If DB changes are needed, also use `colegios-db-evolution`.
- If the validated rows feed OmniSwitch send rules, also use `colegios-omniswitch-envio`.
