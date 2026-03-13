---
name: colegios-desktop-web-history
description: Runbook for the desktop-to-web handoff in colegios. Use when maintaining imported desktop batches, direct-open from the desktop app, or the admin history UI that previews uploaded PDFs.
---

# Colegios Desktop Web History

## Purpose
Use this skill when the task touches the boundary between `desktop_app/`, `services/api/`, and `web/admin/history.html`.

## Product Rule
- Desktop owns operator work.
- Web owns consultation, traceability, and post-upload review.
- Do not rebuild template selection, Excel validation, or PDF generation inside the web admin unless the user explicitly changes the product scope.

## Current Flow
1. Desktop logs in against `/v1/auth/login`.
2. Desktop uploads a batch to `/v1/desktop-batches/import`.
3. API stores a `desktopBatch`, its `desktopDocument` records, `manifest.json`, and PDFs.
4. Desktop may request a temporary web link via `/v1/auth/desktop-web-link`.
5. Web consumes the token via `/v1/auth/desktop-token/consume` and opens `history.html`, optionally focused on one `batchId`.

## API Rules
- Imported desktop paths may come from Windows. Normalize `\` to `/` before extracting file names for multipart matching.
- Validate that a requested `batchId` belongs to the authenticated organization before issuing a direct-open URL.
- Temporary desktop-web tokens must be signed and short-lived.
- The web link should target `/admin/history.html`, not `/admin/upload.html`.

## Web History Rules
- `history.html` is the main admin landing page.
- Default state should emphasize the most recent batch:
  - `Mostrar solo el ultimo lote subido` enabled by default
  - selected batch synchronized with the current filtered result
- The history view should behave like a document inbox:
  - summary metrics
  - batch list and filters
  - selected batch detail
  - inline PDF preview
- Search inside the selected batch should include signer full name built from:
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`

## Error Handling
- If batch import fails, expose API detail in the desktop UI.
- If desktop token consumption fails in the web, fall back to normal auth checks and show a clear message.
- Keep `upload.html` as a soft landing page for old links instead of breaking navigation.

## Verification
- Backend-only change: rebuild `api`.
- Web-only change: rebuild `web`.
- Cross-flow change: verify:
  - desktop upload returns a batch id
  - `Abrir historial web` opens browser
  - admin lands in `history.html`
  - requested batch is focused
  - preview and download work for the selected document
