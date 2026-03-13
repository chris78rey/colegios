import sys

from colegios_desktop.runtime import report_fatal_startup_error


if __name__ == "__main__":
    try:
        from colegios_desktop.app import run

        raise SystemExit(run())
    except SystemExit:
        raise
    except Exception as error:
        report_fatal_startup_error(error)
        sys.exit(1)
