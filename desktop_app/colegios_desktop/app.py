from __future__ import annotations

import sys

from .cli import is_smoke_test, run_smoke_test
from .paths import default_output_dir
from .runtime import configure_runtime_environment


def run() -> int:
    configure_runtime_environment()
    if is_smoke_test(sys.argv):
        return run_smoke_test(sys.argv)

    from PySide6.QtWidgets import QApplication

    from .ui.main_window import MainWindow

    app = QApplication(sys.argv)
    window = MainWindow(output_root=default_output_dir())
    window.show()
    return app.exec()
