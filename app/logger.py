import logging
import logging.handlers
import sys
import threading
import traceback
from datetime import datetime
from pathlib import Path

from .config import LOGS_DIR

APP_LOG = LOGS_DIR / "app.log"
CRASH_LOG = LOGS_DIR / "crash.log"

LOG_MAX_BYTES = 5 * 1024 * 1024
LOG_BACKUPS = 5

_logger: logging.Logger = None

def _make_file_handler() -> logging.Handler:
    handler = logging.handlers.RotatingFileHandler(
        APP_LOG,
        maxBytes=LOG_MAX_BYTES,
        backupCount=LOG_BACKUPS,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)-7s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    return handler

def _make_console_handler() -> logging.Handler:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)-7s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    return handler

def setup_logging(level=logging.INFO) -> logging.Logger:
    global _logger
    if _logger is not None:
        return _logger

    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger("tg_analytics")
    root.setLevel(level)
    root.handlers.clear()
    root.propagate = False

    root.addHandler(_make_file_handler())
    root.addHandler(_make_console_handler())

    for noisy in ("telethon", "urllib3", "requests",
                  "matplotlib", "PIL", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _logger = root
    return root

def get_logger(name: str = "tg_analytics") -> logging.Logger:
    if _logger is None:
        setup_logging()
    if name and name != "tg_analytics":
        return logging.getLogger(f"tg_analytics.{name}")
    return logging.getLogger("tg_analytics")

def log_crash(exc_type, exc_value, exc_tb, source: str = "main"):
    try:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        header = f"\n{'=' * 72}\n{ts} — {source}\n{'=' * 72}\n"
        body = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
        with open(CRASH_LOG, "a", encoding="utf-8") as f:
            f.write(header)
            f.write(body)
            f.write("\n")
    except Exception:
        pass

def install_excepthooks():
    logger = get_logger()

    def _main_hook(exc_type, exc_value, exc_tb):

        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_tb)
            return
        log_crash(exc_type, exc_value, exc_tb, source="main")
        logger.error(
            "Unhandled exception in main thread",
            exc_info=(exc_type, exc_value, exc_tb),
        )

    def _thread_hook(args):
        thread_name = args.thread.name if args.thread else "?"
        log_crash(
            args.exc_type, args.exc_value, args.exc_traceback,
            source=f"thread:{thread_name}",
        )
        logger.error(
            "Unhandled exception in thread %s", thread_name,
            exc_info=(args.exc_type, args.exc_value, args.exc_traceback),
        )

    sys.excepthook = _main_hook
    if hasattr(threading, "excepthook"):
        threading.excepthook = _thread_hook
