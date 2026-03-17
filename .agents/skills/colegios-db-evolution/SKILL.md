---
name: colegios-db-evolution
description: Database evolution runbook for the colegios project. Use when changing Prisma models, adding fields, introducing new tables, or adjusting relationships to ensure additive migrations, data preservation, and a persistent change log from local development.
---

# Colegios DB Evolution

## Overview
Apply schema changes safely (no data loss), generate migrations locally, and record every change in a project log.

## Workflow (always local-first)
1. Update `services/api/prisma/schema.prisma` with additive changes (new fields/tables, optional columns, defaults).
2. Generate migration locally and commit `prisma/migrations/`.
3. Append a short entry to `references/db-change-log.md`.
4. Rebuild and run `migrate deploy` via container start.

## Rules (no data loss)
- Prefer **additive changes**: new nullable fields or fields with defaults.
- Avoid dropping columns or tables; if required, do a **two-step migration**:
  1) Add new column, backfill data, switch reads/writes.
  2) Remove old column in a later release.
- For renames: add new column + backfill + update code, then remove old later.

## Log Entry Template
Append to `references/db-change-log.md` on every schema change:
- Date
- Migration name
- Summary of change
- Backfill steps (if any)
- Rollback note (if possible)

## Safety Checklist
- Migration generated locally.
- Seed updated if defaults/required changes.
- No destructive SQL in migration (unless explicitly approved).

## References
- Change log: `references/db-change-log.md`
