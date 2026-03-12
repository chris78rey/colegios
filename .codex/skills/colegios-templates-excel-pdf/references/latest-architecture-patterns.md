# Latest Architecture Patterns

## Current Product Direction
- The product no longer relies on visible persistent template groups.
- The active user flow is:
  1. upload or select one or more templates
  2. download Excel based on selected templates
  3. upload one real Excel
  4. validate column names directly against placeholders
  5. generate PDFs
  6. inspect outputs grouped by Excel row

## Canonical Naming Rule
- Excel column name must equal placeholder name exactly.
- There is no manual mapping layer anymore.
- If a template uses `{{SegApellido}}`, the Excel must contain `SegApellido`.
- Canonical OmniSwitch signer fields:
  - `Cedula`
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`
  - `Celular`
  - `Email`
  - `FirmaPrincipal`
  - `IdPais`
  - `IdProvincia`
  - `IdCiudad`
  - `Direccion`

## Excel Pattern
- API-generated example Excel must include:
  - canonical signer fields first
  - auxiliary document fields after
  - 10 example rows
  - guide sheet
- There must also be a fixed example Excel route independent of loaded templates:
  - `GET /v1/examples/excel-base`

## Multi-template Batch Pattern
- User may select up to 4 templates directly in the admin UI.
- One Excel can feed all selected templates.
- Validation uses the union of placeholders across selected templates.
- For each Excel row:
  - create one request per selected template
  - generate one PDF per template
- UI must render outputs grouped by row, not merged into a single PDF.

## Internal Engine Rule
- Reuse `TemplateGroup` / `BatchGroup` machinery internally for multi-template execution.
- Do not expose template-group CRUD in the admin unless explicitly requested again.
- Temporary groups should be created as inactive internal artifacts.

## Signatory Extraction Rule
- Prefer canonical representative fields when present.
- Preserve fallback support for legacy aliases only as compatibility.
- Full signer name may be composed from:
  - `PrimerNombre`
  - `SegunNombre`
  - `PrimerApellido`
  - `SegApellido`

## Admin UX Rule
- The admin should validate, not map.
- The Excel step should explain that exact header names are required.
- Example downloads should stay available:
  - fixed Excel example
  - base HTML example
  - matrícula example
- A dynamic agnostic LLM prompt generator is part of the template-authoring assistance flow.

## Error/Guard Patterns
- `/v1/template-groups/...` remains disabled for product-facing use.
- `/v1/batch-groups/...` remains enabled as internal execution surface.
- `/excel` routes must be matched before more generic template routes.
- Template deletion should block only if linked to active groups, requests, or batches.
