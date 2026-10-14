import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

APP_NAME = "TG Analytics"
APP_VERSION = "1.0.0"


def get_base_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent


def get_web_path() -> Path:
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", None)
        if base:
            return Path(base) / "web"
        return Path(sys.executable).parent / "web"
    return Path(__file__).parent.parent / "web"


APP_DIR = get_base_path() / ".tg_analytics"
SESSIONS_DIR = APP_DIR / "sessions"
EXPORTS_DIR = APP_DIR / "exports"
LOGS_DIR = APP_DIR / "logs"
CONFIG_FILE = APP_DIR / "config.json"
DB_FILE = APP_DIR / "analytics.db"


def ensure_dirs():
    for d in (APP_DIR, SESSIONS_DIR, EXPORTS_DIR, LOGS_DIR):
        d.mkdir(parents=True, exist_ok=True)


@dataclass
class AppConfig:
    api_id: int = 0
    api_hash: str = ""
    phone: str = ""
    language: str = "en"
    theme: str = "system"
    collect_interval_min: int = 30
    export_dir: str = str(EXPORTS_DIR)
    retention_days: int = 365

    @classmethod
    def load(cls) -> "AppConfig":
        ensure_dirs()
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                allowed = {k: v for k, v in data.items()
                           if k in cls.__dataclass_fields__}
                return cls(**allowed)
            except Exception:
                pass
        return cls()

    def save(self):
        ensure_dirs()
        CONFIG_FILE.write_text(
            json.dumps(asdict(self), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )