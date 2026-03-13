from __future__ import annotations

import argparse
import json
from pathlib import Path

from .batch_builder import build_batch_plan, export_batch_plan
from .excel_utils import load_workbook_data
from .pdf_generator import generate_batch_pdfs
from .template_utils import load_template_specs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Ejecuta una verificacion interna sin abrir la interfaz.",
    )
    parser.add_argument(
        "--excel",
        default="",
        help="Ruta al Excel o CSV para la verificacion.",
    )
    parser.add_argument(
        "--template",
        dest="templates",
        action="append",
        default=[],
        help="Ruta a una plantilla HTML/HTM/DOCX. Repite --template para varias.",
    )
    parser.add_argument(
        "--output-root",
        default="",
        help="Carpeta base donde guardar la salida del smoke test.",
    )
    parser.add_argument(
        "--json-out",
        default="",
        help="Ruta opcional para guardar un reporte JSON.",
    )
    return parser


def is_smoke_test(argv: list[str]) -> bool:
    return "--smoke-test" in argv


def run_smoke_test(argv: list[str]) -> int:
    parser = build_parser()
    args, _ = parser.parse_known_args(argv[1:])

    if not args.excel:
        raise ValueError("El smoke test requiere --excel.")
    if not args.templates:
        raise ValueError("El smoke test requiere al menos un --template.")

    excel_path = Path(args.excel).expanduser().resolve()
    template_paths = [Path(value).expanduser().resolve() for value in args.templates]
    output_root = (
        Path(args.output_root).expanduser().resolve()
        if args.output_root
        else Path.cwd() / "smoke-output"
    )
    output_root.mkdir(parents=True, exist_ok=True)

    workbook = load_workbook_data(excel_path)
    templates = load_template_specs(template_paths)
    plan = build_batch_plan(workbook, templates)
    export_batch_plan(plan, output_root)

    if plan.missing_columns:
        raise ValueError(
            "El Excel usado para verificacion no contiene las columnas requeridas: "
            + ", ".join(plan.missing_columns)
        )

    batch_dir = generate_batch_pdfs(plan, output_root)
    generated = sum(1 for document in plan.documents if document.status == "READY")
    skipped = sum(1 for document in plan.documents if document.status == "SKIPPED")

    report = {
        "ok": True,
        "batch_dir": str(batch_dir),
        "document_count": len(plan.documents),
        "generated_count": generated,
        "skipped_count": skipped,
        "output_root": str(output_root),
    }

    if args.json_out:
        report_path = Path(args.json_out).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding="utf-8")

    return 0
