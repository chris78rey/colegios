from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from time import perf_counter

from jinja2 import Environment

from .models import BatchPlan
from .runtime import configure_runtime_environment


def generate_batch_pdfs(plan: BatchPlan, output_root: Path) -> Path:
    batch_dir, _ = _generate_batch_pdfs_internal(plan, output_root, capture_metrics=False)
    return batch_dir


def generate_batch_pdfs_profile(plan: BatchPlan, output_root: Path) -> tuple[Path, dict]:
    batch_dir, metrics = _generate_batch_pdfs_internal(plan, output_root, capture_metrics=True)
    return batch_dir, metrics or {}


def _generate_batch_pdfs_internal(
    plan: BatchPlan,
    output_root: Path,
    capture_metrics: bool,
) -> tuple[Path, dict | None]:
    configure_runtime_environment()
    from weasyprint import HTML

    batch_dir = output_root / plan.batch_id
    rows_dir = batch_dir / "rows"
    rows_dir.mkdir(parents=True, exist_ok=True)

    env = Environment(autoescape=False)
    generation_started = perf_counter()
    metrics_documents: list[dict] = []
    skipped_documents = 0

    for document in plan.documents:
        document_started = perf_counter()
        template_path = Path(document.template_path)
        row_dir = rows_dir / f"row-{document.row_index + 1:04d}"
        row_dir.mkdir(parents=True, exist_ok=True)

        if template_path.suffix.lower() not in {".html", ".htm"}:
            document.status = "SKIPPED"
            document.error = "Solo se generan PDFs para plantillas HTML en esta fase."
            skipped_documents += 1
            if capture_metrics:
                metrics_documents.append(
                    {
                        "row_index": document.row_index,
                        "template_name": document.template_name,
                        "output_name": document.output_name,
                        "status": document.status,
                        "total_ms": round((perf_counter() - document_started) * 1000, 2),
                    }
                )
            continue

        row_data = plan.rows[document.row_index]
        render_started = perf_counter()
        html_source = template_path.read_text(encoding="utf-8", errors="ignore")
        rendered_html = env.from_string(html_source).render(**row_data)
        render_elapsed_ms = round((perf_counter() - render_started) * 1000, 2)

        html_path = row_dir / f"{Path(document.output_name).stem}.html"
        pdf_path = row_dir / document.output_name
        write_html_started = perf_counter()
        html_path.write_text(rendered_html, encoding="utf-8")
        write_html_elapsed_ms = round((perf_counter() - write_html_started) * 1000, 2)

        pdf_started = perf_counter()
        HTML(string=rendered_html, base_url=str(template_path.parent)).write_pdf(str(pdf_path))
        pdf_elapsed_ms = round((perf_counter() - pdf_started) * 1000, 2)

        document.rendered_html_path = str(html_path)
        document.pdf_path = str(pdf_path)
        document.status = "READY"
        document.error = None

        if capture_metrics:
            metrics_documents.append(
                {
                    "row_index": document.row_index,
                    "template_name": document.template_name,
                    "output_name": document.output_name,
                    "status": document.status,
                    "render_ms": render_elapsed_ms,
                    "write_html_ms": write_html_elapsed_ms,
                    "write_pdf_ms": pdf_elapsed_ms,
                    "total_ms": round((perf_counter() - document_started) * 1000, 2),
                }
            )

    manifest_path = batch_dir / "manifest.json"
    manifest_started = perf_counter()
    manifest_path.write_text(_serialize_manifest(plan), encoding="utf-8")
    manifest_elapsed_ms = round((perf_counter() - manifest_started) * 1000, 2)

    if not capture_metrics:
        return batch_dir, None

    ready_documents = sum(1 for document in plan.documents if document.status == "READY")
    metrics = {
        "batch_id": plan.batch_id,
        "document_count": len(plan.documents),
        "ready_count": ready_documents,
        "skipped_count": skipped_documents,
        "manifest_write_ms": manifest_elapsed_ms,
        "total_generation_ms": round((perf_counter() - generation_started) * 1000, 2),
        "documents": metrics_documents,
    }
    return batch_dir, metrics


def _serialize_manifest(plan: BatchPlan) -> str:
    import json

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
