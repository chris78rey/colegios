# -*- mode: python ; coding: utf-8 -*-

import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


GTK_DLL_NAMES = [
    "libbrotlicommon.dll",
    "libbrotlidec.dll",
    "libbz2-1.dll",
    "libdatrie-1.dll",
    "libexpat-1.dll",
    "libffi-8.dll",
    "libfontconfig-1.dll",
    "libfreetype-6.dll",
    "libfribidi-0.dll",
    "libgcc_s_seh-1.dll",
    "libgio-2.0-0.dll",
    "libglib-2.0-0.dll",
    "libgmodule-2.0-0.dll",
    "libgobject-2.0-0.dll",
    "libgraphite2.dll",
    "libharfbuzz-0.dll",
    "libiconv-2.dll",
    "libintl-8.dll",
    "libpango-1.0-0.dll",
    "libpangoft2-1.0-0.dll",
    "libpcre2-8-0.dll",
    "libpng16-16.dll",
    "libthai-0.dll",
    "libwinpthread-1.dll",
    "zlib1.dll",
]


def _resolve_dir(env_name, fallback_paths):
    env_value = os.environ.get(env_name, "").strip()
    candidates = [env_value] if env_value else []
    candidates.extend(fallback_paths)
    for raw_path in candidates:
        if not raw_path:
            continue
        candidate = Path(raw_path)
        if candidate.exists():
            return candidate.resolve()
    return None


datas = []
hiddenimports = []
binaries = []

for package_name in [
    "certifi",
    "fontTools",
    "jinja2",
    "pyphen",
    "weasyprint",
]:
    datas += collect_data_files(package_name)

hiddenimports += collect_submodules("weasyprint")
hiddenimports += [
    "tinycss2",
    "tinyhtml5",
    "cssselect2",
    "PIL._imaging",
]

gtk_dll_dir = _resolve_dir(
    "WEASYPRINT_DLL_DIR",
    [
        r"C:\Program Files\GTK3-Runtime Win64\bin",
        r"C:\msys64\mingw64\bin",
    ],
)
if gtk_dll_dir is None:
    raise SystemExit(
        "No se encontro un runtime GTK compatible para WeasyPrint. "
        "Define WEASYPRINT_DLL_DIR o instala GTK3 Runtime Win64 / MSYS2 mingw64."
    )

gtk_etc_dir = _resolve_dir(
    "WEASYPRINT_ETC_DIR",
    [
        str(gtk_dll_dir.parent / "etc"),
        str(gtk_dll_dir.parent.parent / "etc"),
    ],
)
if gtk_etc_dir and (gtk_etc_dir / "fonts" / "fonts.conf").exists():
    datas.append((str(gtk_etc_dir), "etc"))

for dll_name in GTK_DLL_NAMES:
    dll_path = gtk_dll_dir / dll_name
    if not dll_path.exists():
        raise SystemExit(f"Falta la DLL requerida para WeasyPrint: {dll_path}")
    binaries.append((str(dll_path), "."))


a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ColegiosDesktop",
    icon="assets/colegios-desktop.ico",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ColegiosDesktop",
)
