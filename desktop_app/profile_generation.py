from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from time import perf_counter

from colegios_desktop.batch_builder import build_batch_plan, export_batch_plan
from colegios_desktop.excel_utils import load_workbook_data
from colegios_desktop.pdf_generator import generate_batch_pdfs_profile
from colegios_desktop.template_utils import load_template_specs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Perfila la generacion local de documentos del desktop app."
    )
    parser.add_argument(
        "--excel",
        required=True,
        help="Ruta al archivo Excel o CSV.",
    )
    parser.add_argument(
        "--template",
        dest="templates",
        action="append",
        required=True,
        help="Ruta a una plantilla HTML/HTM/DOCX. Repite --template para varias plantillas.",
    )
    parser.add_argument(
        "--output-root",
        default="output/profile-runs",
        help="Carpeta base donde guardar el lote del profiling.",
    )
    parser.add_argument(
        "--limit-rows",
        type=int,
        default=0,
        help="Limita la cantidad de filas procesadas. 0 significa todas.",
    )
    parser.add_argument(
        "--json-out",
        default="",
        help="Ruta opcional para guardar el reporte JSON.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    excel_path = Path(args.excel).expanduser().resolve()
    template_paths = [Path(value).expanduser().resolve() for value in args.templates]
    output_root = Path(args.output_root).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    load_excel_started = perf_counter()
    workbook = load_workbook_data(excel_path)
    load_excel_ms = round((perf_counter() - load_excel_started) * 1000, 2)

    if args.limit_rows and args.limit_rows > 0:
        workbook.rows = workbook.rows[: args.limit_rows]

    load_templates_started = perf_counter()
    templates = load_template_specs(template_paths)
    load_templates_ms = round((perf_counter() - load_templates_started) * 1000, 2)

    build_plan_started = perf_counter()
    plan = build_batch_plan(workbook, templates)
    build_plan_ms = round((perf_counter() - build_plan_started) * 1000, 2)

    export_started = perf_counter()
    batch_dir = export_batch_plan(plan, output_root)
    export_ms = round((perf_counter() - export_started) * 1000, 2)

    generate_started = perf_counter()
    batch_dir, generation = generate_batch_pdfs_profile(plan, output_root)
    generate_wrapper_ms = round((perf_counter() - generate_started) * 1000, 2)

    documents = generation.get("documents", [])
    ready_documents = [item for item in documents if item.get("status") == "READY"]
    slowest_documents = sorted(
        ready_documents,
        key=lambda item: float(item.get("total_ms", 0)),
        reverse=True,
    )[:5]

    report = {
        "excel_path": str(excel_path),
        "template_paths": [str(path) for path in template_paths],
        "output_root": str(output_root),
        "batch_dir": str(batch_dir),
        "row_count": len(workbook.rows),
        "template_count": len(templates),
        "load_excel_ms": load_excel_ms,
        "load_templates_ms": load_templates_ms,
        "build_plan_ms": build_plan_ms,
        "export_manifest_ms": export_ms,
        "generate_wrapper_ms": generate_wrapper_ms,
        "generation": generation,
        "slowest_documents": slowest_documents,
    }

    json_out = str(args.json_out or "").strip()
    if json_out:
        json_out_path = Path(json_out).expanduser().resolve()
        json_out_path.parent.mkdir(parents=True, exist_ok=True)
        json_out_path.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding="utf-8")

    avg_total = round(mean(item.get("total_ms", 0) for item in ready_documents), 2) if ready_documents else 0
    avg_pdf = round(mean(item.get("write_pdf_ms", 0) for item in ready_documents), 2) if ready_documents else 0

    print("=== Perfil de generacion desktop ===")
    print(f"Excel: {excel_path}")
    print(f"Plantillas: {len(template_paths)}")
    print(f"Filas procesadas: {len(workbook.rows)}")
    print(f"Lote generado en: {batch_dir}")
    print("")
    print("Etapas:")
    print(f"- cargar excel: {load_excel_ms} ms")
    print(f"- cargar plantillas: {load_templates_ms} ms")
    print(f"- construir lote: {build_plan_ms} ms")
    print(f"- exportar estructura: {export_ms} ms")
    print(f"- generar documentos: {generation.get('total_generation_ms', 0)} ms")
    print(f"- wrapper de generacion: {generate_wrapper_ms} ms")
    print("")
    print("Resumen documentos:")
    print(f"- total: {generation.get('document_count', 0)}")
    print(f"- listos: {generation.get('ready_count', 0)}")
    print(f"- omitidos: {generation.get('skipped_count', 0)}")
    print(f"- promedio por documento: {avg_total} ms")
    print(f"- promedio solo PDF: {avg_pdf} ms")

    if slowest_documents:
        print("")
        print("Mas lentos:")
        for item in slowest_documents:
            print(
                "- "
                f"fila {int(item.get('row_index', 0)) + 1}, "
                f"{item.get('template_name', 'Plantilla')}, "
                f"pdf={item.get('write_pdf_ms', 0)} ms, "
                f"total={item.get('total_ms', 0)} ms"
            )

    if json_out:
        print("")
        print(f"Reporte JSON: {json_out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
