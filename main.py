import http.server
import os
import socket
import socketserver
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.logger import setup_logging, install_excepthooks, get_logger
setup_logging()
install_excepthooks()

log = get_logger()

import webview

from app.config import AppConfig, get_web_path, APP_NAME, APP_VERSION
from app.database import Database
from app.telegram_client import TelegramWorker
from app.api import Api

DEBUG = os.environ.get("TG_ANALYTICS_DEBUG", "0") == "1"

def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass

    def end_headers(self):
        self.send_header("Cache-Control",
                          "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

class _ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

def start_http_server(web_dir):
    port = _find_free_port()
    handler = lambda *a, **kw: _QuietHandler(
        *a, directory=str(web_dir), **kw,
    )
    httpd = _ThreadingServer(("127.0.0.1", port), handler)
    t = threading.Thread(
        target=httpd.serve_forever, daemon=True, name="http-server",
    )
    t.start()
    return port, httpd

def shutdown_gracefully(api, httpd, db, worker):
    log.info("Shutting down…")

    try:
        log.info("Stopping collector")
        api.collector.stop()
    except Exception as e:
        log.warning("Collector stop failed: %s", e)

    try:
        log.info("Stopping HTTP server")
        httpd.shutdown()
        httpd.server_close()
    except Exception as e:
        log.warning("HTTP server stop failed: %s", e)

    try:
        log.info("Closing database")
        db.close()
    except Exception as e:
        log.warning("DB close failed: %s", e)

    try:
        log.info("Stopping Telegram worker")
        worker.shutdown()
    except Exception as e:
        log.warning("Worker stop failed: %s", e)

    log.info("Shutdown complete")

def main():
    log.info("=" * 60)
    log.info("%s v%s starting", APP_NAME, APP_VERSION)
    log.info("Python %s · frozen=%s",
             sys.version.split()[0], getattr(sys, "frozen", False))

    config = AppConfig.load()
    db = Database()
    worker = TelegramWorker()
    api = Api(config, db, worker)

    web_dir = get_web_path()
    index_path = web_dir / "index.html"
    if not index_path.exists():
        log.error("index.html not found at %s", index_path)
        sys.exit(1)

    port, httpd = start_http_server(web_dir)

    theme = (config.theme or "system").lower()
    if theme not in ("dark", "light", "system"):
        theme = "system"
    url = f"http://127.0.0.1:{port}/index.html?theme={theme}"

    log.info("HTTP server on port %d", port)
    log.info("Web dir: %s", web_dir)
    log.info("Theme: %s", theme)
    if DEBUG:
        log.info("Debug mode ON — F12 opens DevTools")

    if theme == "light":
        window_bg = "#f5f6f8"
    else:
        window_bg = "#0a0b0d"

    window = webview.create_window(
        f"{APP_NAME} v{APP_VERSION}",
        url=url,
        js_api=api,
        width=1280,
        height=820,
        min_size=(1080, 680),
        background_color=window_bg,
    )
    api.set_window(window)
    api.start_collector()

    try:
        webview.start(debug=DEBUG)
    except Exception as e:
        log.exception("webview.start failed")
    finally:
        shutdown_gracefully(api, httpd, db, worker)
        log.info("%s stopped", APP_NAME)

if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        log.exception("Fatal error in main()")
        sys.exit(1)
