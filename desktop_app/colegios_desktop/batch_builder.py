from __future__ import annotations

import json
import uuid
from dataclasses import asdict
from pathlib import Path

from .models import BatchDocumentPlan, BatchPlan, TemplateSpec, WorkbookData
from .template_utils import union_placeholders


def build_batch_plan(workbook: WorkbookData, templates: list[TemplateSpec]) -> BatchPlan:
    required_headers = union_placeholders(templates)
    missing_columns = [header for header in required_headers if header not in workbook.headers]
    batch_id = uuid.uuid4().hex[:12]
    documents: list[BatchDocumentPlan] = []

    for row_index, row in enumerate(workbook.rows):
        group_key = build_group_key(row, row_index)
        for template in templates:
            output_name = f"row-{row_index + 1:04d}__{group_key}__{slugify(template.name)}.pdf"
            documents.append(
                BatchDocumentPlan(
                    row_index=row_index,
                    group_key=group_key,
                    template_name=template.name,
                    template_path=str(template.path),
                    output_name=output_name,
                )
            )

    return BatchPlan(
        batch_id=batch_id,
        source_excel=str(workbook.source_path),
        headers=workbook.headers,
        missing_columns=missing_columns,
        templates=templates,
        rows=workbook.rows,
        documents=documents,
    )


def export_batch_plan(plan: BatchPlan, output_root: Path) -> Path:
    batch_dir = output_root / plan.batch_id
    rows_dir = batch_dir / "rows"
    rows_dir.mkdir(parents=True, exist_ok=True)

    for index, row in enumerate(plan.rows):
        row_dir = rows_dir / f"row-{index + 1:04d}"
        row_dir.mkdir(parents=True, exist_ok=True)
        (row_dir / "row.json").write_text(
            json.dumps(row, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    payload = {
        "batch_id": plan.batch_id,
        "source_excel": plan.source_excel,
        "headers": plan.headers,
        "missing_columns": plan.missing_columns,
        "templates": [
            {
                "name": template.name,
                "path": str(template.path),
                "kind": template.kind,
                "placeholders": template.placeholders,
            }
            for template in plan.templates
        ],
        "rows": plan.rows,
        "documents": [asdict(document) for document in plan.documents],
    }
    (batch_dir / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    return batch_dir


def serialize_plan(plan: BatchPlan) -> str:
    payload = {
        "batch_id": plan.batch_id,
        "source_excel": plan.source_excel,
        "headers": plan.headers,
        "missing_columns": plan.missing_columns,
        "templates": [
            {
                "name": template.name,
                "path": str(template.path),
                "kind": template.kind,
                "placeholders": template.placeholders,
            }
            for template in plan.templates
        ],
        "rows": plan.rows,
        "documents": [asdict(document) for document in plan.documents],
    }
    return json.dumps(payload, ensure_ascii=True, indent=2)


def build_group_key(row: dict[str, str], row_index: int) -> str:
    preferred_keys = [
        "Cedula",
        "AlumnoNombre",
        "PrimerNombre",
        "Email",
    ]
    for key in preferred_keys:
        value = str(row.get(key, "")).strip()
        if value:
            return slugify(value)
    return f"registro-{row_index + 1:04d}"


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-") or "item"
