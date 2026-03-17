# Database Change Log

> Append-only log. Keep entries short and dated.

## 2026-03-06
- Migration: 20260306155610_init
- Summary: Initial schema for organizations, users, templates, requests, signatories, request events, and credits.
- Backfill: N/A
- Rollback: Drop tables (not recommended for production).

## 2026-03-07
- Migration: 20260307140757_template_fields
- Summary: Added Template fields for name, placeholders, requiredColumns, and status.
- Backfill: Defaults apply to existing rows (name='Plantilla', status='active').
- Rollback: Remove new columns (avoid in production).

## 2026-03-11
- Migration: 20260311173000_add_signatory_role_and_primary
- Summary: Added Signatory role and primary signer flags to preserve who signs enrollment requests.
- Backfill: Existing signatories receive defaults role='REPRESENTANTE_PRINCIPAL' and isPrimary=true.
- Rollback: Drop the new columns in a later controlled migration if truly needed.
