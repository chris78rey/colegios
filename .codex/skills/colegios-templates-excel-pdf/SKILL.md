---
name: colegios-templates-excel-pdf
description: "Runbook for template ingestion (DOCX/HTML), Excel header generation, and file linking in colegios."
---

# Colegios Templates, Excel, and PDF Pipeline

## Purpose
Standardize DOCX/HTML template handling, Excel header generation from placeholders, and surfacing per-row file URLs.

## Template Types
- **DOCX**: placeholders extracted from `word/document.xml`.
- **HTML**: placeholders extracted from raw HTML (`{{...}}`).

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
  - Returns `.xlsx` with header row = placeholders.

### Group Excel (union of placeholders)
- `GET /v1/template-groups/:id/excel?organizationId=...&role=ADMIN`

### Files by Row (linking output to Excel row)
- `GET /v1/batches/:id/requests-detail`
  - Returns `items[]` with `{ index, row, request: { id, pdfUrl, docxUrl } }`
- `GET /v1/batch-groups/:id/requests-detail`
  - Returns `items[]` with `{ index, row, requests: [{ templateName, pdfUrl, docxUrl }] }`
- `pdfUrl` / `docxUrl` are **relative** (`/v1/files?...`); UI must prefix with `apiBase`.

## UI Notes (Admin Colegio)
- `Descargar Excel de carga` is a **primary** CTA in the "Plantilla activa" panel and uses `/excel` endpoints (template or group).
- Auto-mapping aliases in UI:
  - `nombre -> no`, `apellido -> ap`, `cedula -> ce`, `email -> em`, `celular -> cel`.
- File list panel loads `requests-detail` and displays per-row links; **always prefix with `apiBase`**.
- Render file links as **large buttons** (`Ver PDF`) to avoid tiny, hard-to-click anchors.
- "Ver PDF" opens an **in-page modal** with an embedded viewer (`iframe`), not a new tab.
- Template name input: only used if user edits it; otherwise use filename (avoids duplicates).

## Error Handling & Guards
- `/excel` routes must be matched **before** list routes. (Use `pathOnly === "/v1/templates"` etc.)
- Group/template selection required before download or batch process.
- Deactivation is allowed: `PATCH /v1/templates/:id` with `status=inactive` for templates in use.
