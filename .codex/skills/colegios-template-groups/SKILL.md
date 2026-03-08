---
name: colegios-template-groups
description: "Runbook for multi-template groups (max 4) in colegios: DB models, API endpoints, UI flow, and batch processing."
---

# Colegios Template Groups

## Purpose
Standardize how groups of up to 4 templates are created, edited, and processed as a single Excel batch in the colegio admin UI.

## Key Concepts
- **TemplateGroup**: A named group of templates for one organization.
- **TemplateGroupItem**: Many-to-many link with ordering (1..4) per group.
- **BatchGroup**: Batch created from an Excel for a template group.
- **RequestGroup**: One row in the Excel; creates multiple `Request` (one per template).
- **Request.requestGroupId**: Optional link to a `RequestGroup` (legacy flow stays intact).

## DB Models (Additive)
- `TemplateGroup(organizationId, name, status, items[])`
- `TemplateGroupItem(groupId, templateId, order, requiredSigners?)`
- `BatchGroup(organizationId, groupId, status, totalCount, mapping, docxZipPath, pdfZipPath)`
- `RequestGroup(batchGroupId, rowIndex, status)`
- `Request.requestGroupId` (nullable)

## API Endpoints
- `GET /v1/template-groups?organizationId=...`
- `POST /v1/template-groups`
  - body: `organizationId`, `role=ADMIN`, `name`, `items[{templateId, order}]`
  - rules: max 4 templates; no duplicates
- `PATCH /v1/template-groups/:id`
  - body: `role=ADMIN`, `items` (replace all), optional `name`
- `DELETE /v1/template-groups/:id` (soft delete by status)
- `POST /v1/batch-groups/start`
  - body: `organizationId`, `groupId`, `columns`, `mapping`, `rows`
  - validates placeholders across all templates in group
- `POST /v1/batch-groups/:id/process`
- `GET /v1/batch-groups?status=PENDING`
- `GET /v1/batch-groups/:id/download?type=pdf|docx`

## UI Flow (Admin Colegio)
- Screen: `web/admin/upload.html`
- **Mode toggle**: `Plantilla unica` vs `Grupo de plantillas` as a pill toggle with clear active state.
- **Crear grupo**: Select up to 4 templates + ordering
- **Editar grupo**: Select a group (card or dropdown), adjust template checks/order, click `Actualizar grupo seleccionado`
- **Mapping**: Union of placeholders across templates; per-placeholder "Usado en: ..." hints
- **Batch start**: in group mode calls `/v1/batch-groups/start`, else legacy `/v1/batches/start`
## UX Guardrails
- Show group cards with clear **Seleccionar** and **Eliminar** buttons; whole row is clickable but buttons remain primary affordances.
- Keep group selection and Excel download in the same section to reduce context switching.
- Upload flow is split into **tabs**:
  - Plantillas
  - Excel y Mapeo
  - Preview y Procesar
  - Archivos
- Tabs are **gated by state** (template/group selected → Excel uploaded → batch created).

## Placeholder/Signatory Rules
- If placeholders contain `persona1_*`, build signatory from `persona1_*` columns.
- If placeholders contain `persona2_*`, build signatory from `persona2_*` columns.
- If neither exists, fallback to legacy single-signatory heuristics.

## Worker Behavior
- Polls both:
  - `/v1/batches?status=PENDING` -> `/v1/batches/:id/process`
  - `/v1/batch-groups?status=PENDING` -> `/v1/batch-groups/:id/process`
- BatchGroup processing mirrors Batch: DOCX render -> PDF convert -> Ghostscript optimize -> zip.

## Constraints & Defaults
- Max **4 templates** per group.
- All changes are **additive**; do not break single-template flow.
- Templates are scoped by `organizationId` (no cross-org mixing).

## Validation/UX Notes
- Group creation fails on duplicate templates or missing active templates.
- When no group selected, mapping grid prompts for selection (prevents processing).
