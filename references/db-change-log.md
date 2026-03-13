# DB Change Log

## 2026-03-08
- Migration: `20260308021924_add_template_groups`
- Summary: Added template grouping models (`TemplateGroup`, `TemplateGroupItem`, `BatchGroup`, `RequestGroup`) and optional `Request.requestGroupId` to support multi-template batches without breaking existing flows.
- Backfill: None (all new fields are optional or have defaults).
- Rollback: Drop the new tables and `Request.requestGroupId` if needed (data loss for group feature only).

## 2026-03-12
- Migration: `20260312143000_add_desktop_batches`
- Summary: Added `DesktopBatch` and `DesktopDocument` to persist locally generated desktop lots uploaded into the web system without reusing the existing web batch/request pipeline.
- Backfill: None (new additive tables only).
- Rollback: Drop `DesktopDocument` and `DesktopBatch` if the desktop import flow is removed.

## 2026-03-12
- Migration: `20260312210000_add_omni_tracking`
- Summary: Added `OmniRequest`, `OmniDocument`, and `OmniEvent` plus linking relations from `Organization`, `RequestGroup`, `DesktopBatch`, `DesktopDocument`, and `Request` to support OmniSwitch request tracking, per-document polling, and audit events for both mock and real provider modes.
- Backfill: None (new additive tables and optional relations only).
- Rollback: Drop `OmniEvent`, `OmniDocument`, and `OmniRequest` if OmniSwitch tracking is removed before production usage.

## 2026-03-12
- Migration: `20260312213000_add_omni_billing_fields`
- Summary: Added billing defaults on `Organization`, optional billing overrides on `Template`, and resolved billing snapshot fields on `OmniRequest` to support institution-paid vs signer-paid OmniSwitch flows.
- Backfill: Existing rows use additive defaults (`ORG_BALANCE`, `0.00`, `USD`, `NOT_REQUIRED`).
- Rollback: Remove the new billing fields in a later migration if the billing policy layer is discarded.

## 2026-03-12
- Migration: `20260312214500_add_omni_payment_reference`
- Summary: Added `OmniRequest.paymentReference` to persist the operational value sent as `PaymentRequired` when the signer pays directly in OmniSwitch.
- Backfill: None (new optional field).
- Rollback: Remove `paymentReference` if the provider payment-reference pattern changes later.

## 2026-03-12
- Migration: `20260312220000_add_rc_validations`
- Summary: Added `RcValidation` plus optional relations from `Organization`, `DesktopBatch`, `RequestGroup`, and `OmniRequest` to persist QueryRC identity checks, provider request references, and evidence file paths for demographic, biometric, and data-consent validations.
- Backfill: None (new additive table and optional relations only).
- Rollback: Drop `RcValidation` and the new relation fields if QueryRC persistence is removed before production usage.
