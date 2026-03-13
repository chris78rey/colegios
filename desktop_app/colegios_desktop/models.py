from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class TemplateSpec:
    path: Path
    name: str
    kind: str
    placeholders: list[str] = field(default_factory=list)


@dataclass(slots=True)
class WorkbookData:
    source_path: Path
    headers: list[str]
    rows: list[dict[str, str]]


@dataclass(slots=True)
class BatchDocumentPlan:
    row_index: int
    group_key: str
    template_name: str
    template_path: str
    output_name: str
    status: str = "PLANNED"
    rendered_html_path: str | None = None
    pdf_path: str | None = None
    error: str | None = None


@dataclass(slots=True)
class BatchPlan:
    batch_id: str
    source_excel: str
    headers: list[str]
    missing_columns: list[str]
    templates: list[TemplateSpec]
    rows: list[dict[str, str]]
    documents: list[BatchDocumentPlan]
