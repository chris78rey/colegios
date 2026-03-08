# DB Change Log

## 2026-03-08
- Migration: `20260308021924_add_template_groups`
- Summary: Added template grouping models (`TemplateGroup`, `TemplateGroupItem`, `BatchGroup`, `RequestGroup`) and optional `Request.requestGroupId` to support multi-template batches without breaking existing flows.
- Backfill: None (all new fields are optional or have defaults).
- Rollback: Drop the new tables and `Request.requestGroupId` if needed (data loss for group feature only).
