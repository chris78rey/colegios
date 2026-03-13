from __future__ import annotations

import re
import zipfile
from pathlib import Path

from .models import TemplateSpec


PLACEHOLDER_RE = re.compile(r"{{\s*([^{}]+?)\s*}}")


def extract_placeholders(template_path: Path) -> list[str]:
    suffix = template_path.suffix.lower()
    if suffix in {".html", ".htm"}:
        text = template_path.read_text(encoding="utf-8", errors="ignore")
        return _unique_placeholders(text)
    if suffix == ".docx":
        with zipfile.ZipFile(template_path) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
        return _unique_placeholders(xml)
    raise ValueError(f"Tipo de plantilla no soportado: {template_path.suffix}")


def load_template_specs(paths: list[Path]) -> list[TemplateSpec]:
    specs: list[TemplateSpec] = []
    for path in paths:
        placeholders = extract_placeholders(path)
        specs.append(
            TemplateSpec(
                path=path,
                name=path.stem,
                kind=path.suffix.lower().lstrip("."),
                placeholders=placeholders,
            )
        )
    return specs


def union_placeholders(templates: list[TemplateSpec]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for template in templates:
        for placeholder in template.placeholders:
            if placeholder in seen:
                continue
            seen.add(placeholder)
            ordered.append(placeholder)
    return ordered


def _unique_placeholders(text: str) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for match in PLACEHOLDER_RE.findall(text):
        value = match.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
