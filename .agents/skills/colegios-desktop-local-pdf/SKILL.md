---
name: colegios-desktop-local-pdf
description: Runbook for the local PySide6 desktop app in colegios. Use when extending the desktop operator workflow, generating PDFs locally from Excel plus multiple templates, simplifying UX for non-technical users, or preparing future upload and OmniSwitch integration from a local batch manifest.
---

# Colegios Desktop Local PDF

## Purpose
Use this skill for work under `desktop_app/`. This app is now the primary operator flow for templates, Excel selection, local PDF generation, and batch upload.

## Use This When
- The user wants a local app or future Windows executable.
- The task is about local PDF generation from Excel.
- The task is about simplifying UX for non-technical operators.
- The task is about preserving row/template grouping for later upload or OmniSwitch work.

## Product Decision
- Treat the desktop app as the source of truth for operator work.
- Do **not** move template selection or Excel processing back into the web admin unless the user explicitly changes the product decision.
- Prefer HTML templates for local generation.
- Avoid LibreOffice and other heavy office dependencies in the desktop app.

## Current Stack
- UI: `PySide6`
- Excel: `openpyxl`
- HTML templating: `Jinja2`
- PDF generation: `WeasyPrint`
- Entry point: `desktop_app/main.py`

## Key Files
- `desktop_app/colegios_desktop/ui/main_window.py`
- `desktop_app/colegios_desktop/excel_utils.py`
- `desktop_app/colegios_desktop/template_utils.py`
- `desktop_app/colegios_desktop/batch_builder.py`
- `desktop_app/colegios_desktop/pdf_generator.py`

## UX Rules
- Optimize for operators, not developers.
- Keep the visible flow to 3 steps:
  - seleccionar plantillas
  - seleccionar Excel
  - generar documentos
- Keep post-generation actions lightweight:
  - copiar ruta de salida
  - subir documentos al sistema
  - abrir historial web
- Avoid technical words in the main UI:
  - avoid `manifest`, `batch`, `placeholder`, `pipeline`
  - prefer `plantillas`, `Excel`, `documentos`, `columnas faltantes`
- Use one dominant primary action:
  - `Generar documentos`
- Keep progress plain and friendly:
  - `esperando archivos`
  - `plantillas cargadas`
  - `Excel cargado`
  - `preparando documentos`
  - `generando PDF`
  - `listo`

## Rendering and Performance Rules
- Preserve rendering fidelity over micro-optimizations.
- If an optimization changes PDF appearance (`cuadros`, fonts, spacing, layout drift), revert it even if throughput improves.
- Current safe path is:
  - read the HTML template per document
  - render with Jinja per document
  - export batch structure before PDF generation
- When investigating slowness, measure first:
  - use `desktop_app/profile_generation.py`
  - capture Excel load time, batch build time, total generation time, and per-document `write_pdf` time
  - do not rewrite the generation strategy until timings show the real bottleneck

## Template Rules
- Local PDF generation currently supports only `.html` / `.htm`.
- `.docx` may still be selected and tracked, but should be marked `SKIPPED` instead of forcing external conversion.
- Images in HTML templates are supported when referenced with valid local relative paths.
- Render HTML with `base_url=template_path.parent` so local assets resolve correctly.

## Grouping Rules
- Preserve one logical group per Excel row.
- Every planned/generated document must retain:
  - `row_index`
  - `group_key`
  - `template_name`
  - `template_path`
  - `output_name`
- `group_key` should come from business-identifying fields when present (`Cedula`, `AlumnoNombre`, `PrimerNombre`, `Email`), otherwise fallback to `registro-0001`.
- This grouping is required for future upload and OmniSwitch integration.

## Output Rules
- Export under `desktop_app/output/<batch_id>/`
- Keep:
  - `manifest.json`
  - `rows/row-0001/row.json`
  - rendered `.html`
  - generated `.pdf`
- Update each document with:
  - `status`
  - `rendered_html_path` when applicable
  - `pdf_path` when generated
  - `error` when skipped or failed
- Keep the last generated output path available in the UI so the operator can copy it manually.

## Error Handling
- If templates are missing, block generation with a simple warning.
- If Excel is missing or empty, block generation with a simple warning.
- If required columns are missing, show exact column names and stop before rendering.
- Unsupported formats should mark documents `SKIPPED`, not crash the full batch.
- When API upload fails, surface the backend error detail in the desktop message instead of a generic `400`.

## Web Handoff Rules
- The desktop app uploads only documents in `READY` state.
- After a successful upload, preserve the returned `batchId` in the UI state.
- Allow operators to open the web directly from desktop using the API-driven temporary link flow.
- Never pass raw credentials in the browser URL.
- If the app opens the web after upload, prefer targeting the uploaded batch directly.

## Distribution Guidance
- Shape the app for future Windows packaging.
- Prefer Python-native dependencies that are realistic to bundle.
- Do not introduce LibreOffice-based conversion into this app unless the product decision changes.
