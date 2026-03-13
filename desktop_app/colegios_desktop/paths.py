from __future__ import annotations

import os
import sys
from pathlib import Path


def bundle_root() -> Path:
    meipass = getattr(sys, "_MEIPASS", "")
    if meipass:
        return Path(meipass).resolve()
    return app_root()


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def default_output_dir() -> Path:
    documents = _documents_dir()
    output_dir = documents / "Colegios Desktop Output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _documents_dir() -> Path:
    home = Path.home()
    candidates = []

    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        candidates.append(Path(userprofile) / "Documents")

    candidates.extend(
        [
            home / "Documents",
            home / "Mis Documentos",
            home,
        ]
    )

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return home
