from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from .paths import default_config_dir

SETTINGS_FILE_NAME = "settings.json"
DEFAULT_API_BASE = "http://localhost:8080"


@dataclass(slots=True)
class ConnectionSettings:
    remember_connection: bool = False
    api_base: str = DEFAULT_API_BASE
    email: str = ""
    password: str = ""


class DesktopSettingsStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or (default_config_dir() / SETTINGS_FILE_NAME)

    def load_connection_settings(self) -> ConnectionSettings:
        if not self.path.exists():
            return ConnectionSettings()

        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError, json.JSONDecodeError):
            return ConnectionSettings()

        if not isinstance(payload, dict):
            return ConnectionSettings()

        return ConnectionSettings(
            remember_connection=bool(payload.get("remember_connection", False)),
            api_base=str(payload.get("api_base") or DEFAULT_API_BASE).strip() or DEFAULT_API_BASE,
            email=str(payload.get("email") or "").strip(),
            password=str(payload.get("password") or ""),
        )

    def save_connection_settings(self, settings: ConnectionSettings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temp_path.write_text(
            json.dumps(asdict(settings), ensure_ascii=True, indent=2),
            encoding="utf-8",
        )
        temp_path.replace(self.path)

    def clear_connection_settings(self) -> None:
        try:
            self.path.unlink()
        except FileNotFoundError:
            return
