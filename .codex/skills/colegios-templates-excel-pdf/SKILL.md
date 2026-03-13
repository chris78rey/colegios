---
name: colegios-templates-excel-pdf
description: "Runbook for template ingestion (DOCX/HTML), Excel header generation, and file linking in colegios."
---

# Colegios Templates, Excel, and PDF Pipeline

## Purpose
Standardize DOCX/HTML template handling, Excel header generation from placeholders, and surfacing per-row file URLs.

## Read This When
- You are changing template ingestion, Excel generation, placeholder validation, preview, or batch processing from the admin UI.
- For the latest operating rules of the current product flow, also read `references/latest-architecture-patterns.md`.

## Template Types
- **DOCX**: placeholders extracted from `word/document.xml`.
- **HTML**: placeholders extracted from raw HTML (`{{...}}`).

## HTML Print Base
- For new HTML templates, start from `plantillas/ejemplos/base_html_impresion.html`.
- Keep `@page` margins explicit for A4 output.
- Use a reusable `.signature-block` with `page-break-inside: avoid` / `break-inside: avoid-page`.
- Avoid large `margin-top` gaps before signatures; reduce font size and vertical spacing before adding pages.
- If a signature ends up alone on page 2, fix layout in the template CSS instead of forcing blank filler content.

## Placeholder Convention
- Use the exact Excel column names as placeholders in the template.
- For OmniSwitch signer fields, prefer canonical placeholders exactly as required by the API:
  - `{{Cedula}}`, `{{PrimerNombre}}`, `{{SegunNombre}}`, `{{PrimerApellido}}`, `{{SegApellido}}`, `{{Celular}}`, `{{Email}}`, `{{FirmaPrincipal}}`, `{{IdPais}}`, `{{IdProvincia}}`, `{{IdCiudad}}`, `{{Direccion}}`
- Additional document fields may coexist, for example:
  - `{{AlumnoNombre}}`, `{{AlumnoApellido}}`, `{{Curso}}`, `{{Fecha}}`, `{{Institucion}}`
- Do not invent alias layers like `representante_nombre` when the canonical field is already defined as `PrimerNombre`.

## Conversion Pipeline
- DOCX -> HTML via `pandoc`
- HTML -> PDF via Playwright/Chromium
- **Fallback**: if HTML->PDF fails, use LibreOffice DOCX->PDF (legacy)
- HTML templates skip DOCX and render directly to PDF.

## Dependencies
- Backend `services/api`:
  - `playwright` (Chromium)
  - `pandoc`
  - `xlsx` (Excel generation)
- Dockerfile installs `pandoc` and Playwright Chromium:
  - `npx playwright install --with-deps chromium`

## API Endpoints
### Template Excel
- `GET /v1/templates/:id/excel?organizationId=...&role=ADMIN`
  - Returns `.xlsx` with canonical signer fields first and 10 example rows.

### Multi-template Excel
- `GET /v1/templates/excel?organizationId=...&role=ADMIN&templateIds=id1,id2,...`
  - Returns `.xlsx` with the union of placeholders across selected templates.

### Fixed Example Excel
- `GET /v1/examples/excel-base`
  - Returns a fixed `.xlsx` with 10 example rows even if there are no templates loaded.

### Example HTML Downloads
- `GET /v1/examples/template-base-html`
- `GET /v1/examples/template-matricula-html`

### Files by Row (linking output to Excel row)
- `GET /v1/batches/:id/requests-detail`
  - Returns `items[]` with `{ index, row, request: { id, status, pdfUrl, docxUrl } }`
- `GET /v1/batch-groups/:id/requests-detail`
  - Returns `items[]` with `{ index, row, requests: [{ templateName, status, pdfUrl, docxUrl }] }`
- `pdfUrl` / `docxUrl` are **relative** (`/v1/files?...`); UI must prefix with `apiBase`.

## UI Notes (Admin Colegio)
- Current UI is **multi-template by selection**, not persistent groups:
  - user may select up to 4 templates
  - one Excel feeds all selected templates
  - output is grouped by Excel row, with one PDF per template
- `Descargar Excel de carga` uses:
  - single template route when one template is selected
  - `/v1/templates/excel` when multiple templates are selected
- `Descargar Excel ejemplo` must remain available even when there are no templates loaded.
- There is **no manual mapping** in the product flow anymore:
  - Excel column name must equal placeholder name exactly
  - UI only validates missing columns and shows where each placeholder is used
- File list panel loads `requests-detail` and displays per-row links; **always prefix with `apiBase`**.
- Render file links as **large buttons** (`Ver PDF`) to avoid tiny, hard-to-click anchors.
- "Ver PDF" opens an **in-page modal** with an embedded viewer (`iframe`), not a new tab.
- Preferred UX is now **estado del proceso**:
  - preview is only for validation and row selection
  - after submit, messaging should shift to `Proceso enviado`
  - the final tab should open as soon as a batch exists; do not wait for `READY`
  - show request-level status badges (`QUEUED`, `PROCESSING`, `READY`, `ERROR`)
- Template name input: only used if user edits it; otherwise use filename (avoids duplicates).
- The admin includes a dynamic **agnostic prompt generator** for HTML templates:
  - input: document type + extra context
  - output: copyable LLM prompt that enforces canonical placeholders and A4 HTML rules

## Error Handling & Guards
- `/excel` routes must be matched **before** list routes. (Use `pathOnly === "/v1/templates"` etc.)
- Template selection is required for real batch processing; fixed example downloads must not depend on loaded templates.
- When validating an uploaded Excel, disable processing if any selected-template placeholder is missing from headers.
- Deactivation is allowed: `PATCH /v1/templates/:id` with `status=inactive` for templates in use.

## Async Processing Pattern
- New batches and requests should start in `QUEUED` when the UI says "proceso enviado".
- Prefer API-side immediate dispatch right after batch creation; worker polling is fallback/recovery.
- When processing completes, update each request with:
  - `status: "READY"` and `pdfPath` if the file exists
  - `status: "ERROR"` if generation failed
