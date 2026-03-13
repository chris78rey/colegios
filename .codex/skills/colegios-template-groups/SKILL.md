---
name: colegios-template-groups
description: "Runbook for the internal multi-template batch engine in colegios. Use when maintaining the hidden batch-group machinery that powers one-Excel-to-many-templates processing, without re-enabling persistent group management in the UI."
---

# Colegios Multi-template Engine

## Purpose
Document the internal engine used to process up to 4 templates against one Excel, while keeping persistent `template groups` disabled in the user-facing product.

## Key Concepts
- **TemplateGroup**: Internal persistence artifact reused as a temporary container for a multi-template batch.
- **TemplateGroupItem**: Many-to-many link with ordering (1..4) per group.
- **BatchGroup**: Multi-template batch created from one Excel.
- **RequestGroup**: One row in the Excel; creates multiple `Request` (one per template).
- **Request.requestGroupId**: Optional link to a `RequestGroup` (legacy flow stays intact).

## Product Rule
- Do **not** reintroduce CRUD for persistent template groups in `web/admin/upload.html` unless the user explicitly asks for that product feature again.
- Current UX is:
  - select up to 4 templates directly from the template list
  - upload one Excel
  - create one `BatchGroup` internally
  - generate one PDF per selected template for each Excel row

## DB Models (Additive)
- `TemplateGroup(organizationId, name, status, items[])`
- `TemplateGroupItem(groupId, templateId, order, requiredSigners?)`
- `BatchGroup(organizationId, groupId, status, totalCount, mapping, docxZipPath, pdfZipPath)`
- `RequestGroup(batchGroupId, rowIndex, status)`
- `Request.requestGroupId` (nullable)

## Current API Contract
- `POST /v1/batches/start`
  - accepts `templateId` for single-template flow
  - accepts `templateIds[]` for multi-template flow
  - when `templateIds.length > 1`, the API:
    - validates the union of placeholders
    - creates an internal inactive `TemplateGroup`
    - creates a `BatchGroup`
    - creates one `RequestGroup` per Excel row
    - creates one `Request` per selected template per row
- `POST /v1/batch-groups/:id/process`
- `GET /v1/batch-groups?status=PENDING`
- `GET /v1/batch-groups?status=QUEUED`
- `GET /v1/batch-groups/:id/requests-detail`
  - returns row-grouped files plus request `status` for the UI

## Disabled API Surface
- `/v1/template-groups/...` should remain `410 feature_disabled` for product-facing usage.

## UI Flow (Admin Colegio)
- Screen: `web/admin/upload.html`
- No mode toggle.
- No group CRUD.
- Multi-select templates directly in the template panel.
- Excel validation shows placeholder usage by template and missing columns.
- Batch start always calls `/v1/batches/start`; API decides `single` vs `multi`.

## UX Guardrails
- Upload flow is split into **tabs**:
  - Plantillas
  - Excel y Validacion
  - Preview y Procesar
  - Estado del proceso
- Tabs are **gated by state** (template selected → Excel uploaded → batch created).
- The user thinks in terms of **one Excel row = one record**, not in terms of persistent groups.

## Placeholder/Signatory Rules
- Multi-template validation uses the **union of placeholders** across selected templates.
- Excel headers must equal placeholders exactly; do not reintroduce manual mapping.
- If placeholders contain `persona1_*`, build signatory from `persona1_*` columns.
- If placeholders contain `persona2_*`, build signatory from `persona2_*` columns.
- If canonical OmniSwitch representative fields exist (`Cedula`, `PrimerNombre`, etc.), prefer them.
- If neither exists, fallback to legacy single-signatory heuristics.

## Worker Behavior
- Polls both:
  - `/v1/batches?status=QUEUED|PENDING` -> `/v1/batches/:id/process`
  - `/v1/batch-groups?status=QUEUED|PENDING` -> `/v1/batch-groups/:id/process`
- BatchGroup processing mirrors Batch and stores outputs grouped by row.
- API should also auto-dispatch processing immediately after creation; worker polling remains a fallback.

## Constraints & Defaults
- Max **4 templates** per batch.
- Keep single-template flow working through the same `/v1/batches/start` endpoint.
- Templates are scoped by `organizationId` (no cross-org mixing).
- Temporary internal groups should be created with `status: "inactive"` so they do not behave like user-managed groups.
- New `Batch`, `BatchGroup`, `Request`, and `RequestGroup` records should start in `QUEUED` when using the async UX.

## Validation/UX Notes
- If any selected template is missing or inactive, reject the batch.
- If any placeholder in the selected-template union is missing from Excel headers, reject the batch.
- `requests-detail` for batch groups is the source of truth for rendering multiple PDFs under one row in the UI.
- Propagate request/request-group states as work advances:
  - `QUEUED` on creation
  - `PROCESSING` when claimed
  - `READY` or `ERROR` on completion
