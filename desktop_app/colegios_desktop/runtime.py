from __future__ import annotations

import ctypes
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

from .paths import app_root, bundle_root, default_output_dir


def configure_runtime_environment() -> None:
    dll_dirs: list[Path] = []
    seen: set[Path] = set()

    for candidate in [bundle_root(), app_root(), app_root() / "_internal"]:
        if not candidate.exists():
            continue
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        dll_dirs.append(resolved)

    for dll_dir in dll_dirs:
        _add_dll_directory(dll_dir)

    fonts_dir = _find_fonts_dir(dll_dirs)
    if fonts_dir:
        os.environ.setdefault("FONTCONFIG_PATH", str(fonts_dir))
        os.environ.setdefault("FONTCONFIG_FILE", str(fonts_dir / "fonts.conf"))


def report_fatal_startup_error(error: BaseException) -> Path | None:
    output_dir = default_output_dir()
    logs_dir = output_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = logs_dir / f"startup-error-{timestamp}.log"
    detail = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    log_path.write_text(detail, encoding="utf-8")

    message = (
        "La aplicacion no pudo iniciar.\n\n"
        f"{error}\n\n"
        f"Se guardo un reporte tecnico en:\n{log_path}"
    )
    _show_message_box("Error al iniciar Colegios Desktop", message)
    return log_path


def _find_fonts_dir(candidates: list[Path]) -> Path | None:
    for candidate in candidates:
        fonts_dir = candidate / "etc" / "fonts"
        if (fonts_dir / "fonts.conf").exists():
            return fonts_dir
    return None


def _add_dll_directory(path: Path) -> None:
    if os.name != "nt" or not path.exists():
        return
    add_dll_directory = getattr(os, "add_dll_directory", None)
    if add_dll_directory is None:
        return
    try:
        add_dll_directory(str(path))
    except OSError:
        pass


def _show_message_box(title: str, message: str) -> None:
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
        return
    print(f"{title}\n\n{message}", file=sys.stderr)
