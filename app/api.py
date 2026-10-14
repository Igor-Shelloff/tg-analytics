import base64
import csv
import io
import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

import webview

from .config import AppConfig, LOGS_DIR
from .database import Database
from .telegram_client import TelegramWorker
from .analytics import compute_dashboard
from .logger import get_logger

log = get_logger("api")

class Api:
    def __init__(self, config: AppConfig, db: Database,
                 worker: TelegramWorker):
        self.config = config
        self.db = db
        self.worker = worker
        self._window: Optional[webview.Window] = None
        self._collecting: set = set()
        self._collecting_lock = threading.Lock()
        from .collector import Collector
        self.collector = Collector(self)

    def set_window(self, window):
        self._window = window

    def emit(self, event_type: str, **data):
        if not self._window:
            return
        payload = json.dumps(
            {"type": event_type, "data": data}, ensure_ascii=False,
        )
        try:
            self._window.evaluate_js(
                f"window.TG && window.TG.onEvent({payload})"
            )
        except Exception:
            pass

    def get_config(self):
        return {
            "api_id": self.config.api_id,
            "api_hash": self.config.api_hash,
            "phone": self.config.phone,
            "language": self.config.language,
            "theme": self.config.theme,
            "collect_interval_min": self.config.collect_interval_min,
            "retention_days": self.config.retention_days,
            "export_dir": self.config.export_dir,
        }

    def save_config(self, patch: dict):
        for k, v in (patch or {}).items():
            if hasattr(self.config, k):
                setattr(self.config, k, v)
        self.config.save()
        return True

    def set_language(self, lang: str):
        if lang in ("en", "ru", "es", "pt", "de"):
            self.config.language = lang
            self.config.save()
        return True

    def set_collect_interval(self, minutes: int):
        try:
            minutes = int(minutes)
        except (ValueError, TypeError):
            return False
        if minutes not in (0, 15, 30, 60, 120, 360):
            return False
        self.config.collect_interval_min = minutes
        self.config.save()
        self.emit("settings.changed", key="collect_interval_min",
                  value=minutes)
        return True

    def set_retention_days(self, days: int):
        try:
            days = int(days)
        except (ValueError, TypeError):
            return False
        if days not in (30, 90, 180, 365, 3650):
            return False
        self.config.retention_days = days
        self.config.save()
        return True

    def set_theme(self, theme: str):
        if theme in ("dark", "light", "system"):
            self.config.theme = theme
            self.config.save()
        return True

    def choose_export_dir(self):
        try:
            result = self._window.create_file_dialog(
                webview.FOLDER_DIALOG,
            )
            if result and len(result) > 0:
                self.config.export_dir = result[0]
                self.config.save()
                return {"ok": True, "path": result[0]}
        except Exception as e:
            return {"ok": False, "message": str(e)}
        return {"ok": False, "message": "cancelled"}

    def get_storage_stats(self):
        try:
            stats = self.db.storage_stats()
            stats["export_dir"] = self.config.export_dir
            return {"ok": True, "data": stats}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def purge_old_data(self):
        try:
            days = int(self.config.retention_days or 0)
            if days > 0:
                self.db.purge_older_than(days)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def delete_all_tracked(self):
        try:
            self.db.delete_all_tracked()
            self.emit("data.cleared")
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def start_collector(self):
        try:
            self.collector.start()
            return True
        except Exception:
            return False

    def trigger_collect_now(self):
        try:
            self.collector.trigger_now()
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def get_collector_status(self):
        last_run = self.collector.get_last_run()
        next_in_sec = None
        try:
            next_in_sec = self.collector.get_next_run_seconds()
        except Exception:
            next_in_sec = None

        return {
            "running": self.collector.is_running(),
            "last_run": last_run,
            "interval_min": int(self.config.collect_interval_min or 0),
            "next_in_sec": next_in_sec,
        }

    def open_logs_dir(self):
        try:
            path = str(LOGS_DIR)
            if sys.platform == "win32":
                os.startfile(path)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
            return {"ok": True, "path": path}
        except Exception as e:
            log.warning("Failed to open logs dir: %s", e)
            return {"ok": False, "message": str(e), "path": str(LOGS_DIR)}

    def get_logs_info(self):
        info = {
            "dir": str(LOGS_DIR),
            "app_log_size": 0,
            "crash_log_size": 0,
            "crash_log_exists": False,
        }
        try:
            app_log = LOGS_DIR / "app.log"
            crash_log = LOGS_DIR / "crash.log"
            if app_log.exists():
                info["app_log_size"] = app_log.stat().st_size
            if crash_log.exists():
                info["crash_log_size"] = crash_log.stat().st_size
                info["crash_log_exists"] = True
        except Exception:
            pass
        return info

    def has_session(self) -> bool:
        return self.worker.has_session_file()

    def check_session(self):
        if not self.config.api_id or not self.config.api_hash:
            return {"ok": False, "message": "no_credentials"}
        if not self.worker.has_session_file():
            return {"ok": False, "message": "no_session"}

        done = threading.Event()
        result = {"ok": False, "message": ""}

        def on_done(fut):
            try:
                ok, msg = fut.result()
                result["ok"], result["message"] = ok, msg
            except Exception as e:
                result["ok"], result["message"] = False, str(e)
            done.set()

        def on_log(msg):
            self.emit("log", level="info", message=msg)

        fut = self.worker.try_restore_session(
            self.config.api_id, self.config.api_hash, on_log,
        )
        fut.add_done_callback(on_done)
        done.wait(timeout=20)
        return result

    def login_sms(self, api_id, api_hash, phone):
        try:
            api_id = int(api_id)
        except (ValueError, TypeError):
            return {"ok": False, "message": "invalid api_id"}

        self.config.api_id = api_id
        self.config.api_hash = api_hash
        self.config.phone = phone
        self.config.save()

        done = threading.Event()
        result = {"ok": False, "message": ""}

        def on_done(fut):
            try:
                ok, msg = fut.result()
                result["ok"], result["message"] = ok, msg
            except Exception as e:
                result["ok"], result["message"] = False, str(e)
            done.set()

        def on_log(msg):
            self.emit("log", level="info", message=msg)

        def on_code_needed():
            self.emit("auth.code_needed")

        def on_password_needed():
            self.emit("auth.password_needed")

        fut = self.worker.authorize_sms(
            api_id, api_hash, phone,
            on_log=on_log,
            on_code_needed=on_code_needed,
            on_password_needed=on_password_needed,
        )
        fut.add_done_callback(on_done)
        done.wait(timeout=300)
        return result

    def login_qr(self, api_id, api_hash):
        try:
            api_id = int(api_id)
        except (ValueError, TypeError):
            return {"ok": False, "message": "invalid api_id"}

        self.config.api_id = api_id
        self.config.api_hash = api_hash
        self.config.save()

        done = threading.Event()
        result = {"ok": False, "message": ""}

        def on_done(fut):
            try:
                ok, msg = fut.result()
                result["ok"], result["message"] = ok, msg
            except Exception as e:
                result["ok"], result["message"] = False, str(e)
            done.set()

        def on_log(msg):
            self.emit("log", level="info", message=msg)

        def on_qr_url(url: str):
            img = self._qr_to_data_url(url)
            self.emit("auth.qr_url", url=url, image=img)

        def on_password_needed():
            self.emit("auth.password_needed")

        fut = self.worker.authorize_qr(
            api_id, api_hash,
            on_log=on_log,
            on_qr_url=on_qr_url,
            on_password_needed=on_password_needed,
        )
        fut.add_done_callback(on_done)
        done.wait(timeout=300)
        return result

    def submit_code(self, code: str):
        self.worker.submit_code(code)
        return True

    def submit_password(self, password: str):
        self.worker.submit_password(password)
        return True

    def cancel_auth(self):
        self.worker.cancel_auth_wait()
        return True

    def logout(self):
        try:
            self.collector.stop()
        except Exception:
            pass
        self.worker.logout()
        return True

    def list_dialogs(self):
        def on_log(msg):
            self.emit("log", level="info", message=msg)

        r = self.worker.list_admin_channels(on_log)
        if not r["ok"]:
            return {"ok": False, "message": r["message"], "items": []}

        tracked_ids = {row["tg_id"] for row in self.db.list_channels()}
        items = []
        for ch in r["items"]:
            ch["tracked"] = ch["tg_id"] in tracked_ids
            items.append(ch)
        return {"ok": True, "items": items}

    def list_tracked(self):
        rows = self.db.list_channels()
        items = []
        for row in rows:
            latest = self.db.latest_snapshot(row["id"])
            subs = latest["subscribers"] if latest else 0
            posts_count = len(self.db.posts_since(row["id"], days=3650))
            keys = row.keys()
            items.append({
                "id": row["id"],
                "tg_id": row["tg_id"],
                "username": row["username"] or "",
                "title": row["title"],
                "subscribers": subs,
                "posts_count": posts_count,
                "tracked_at": row["tracked_at"],
                "is_public": bool(row["is_public"]) if "is_public" in keys else False,
            })
        return {"ok": True, "items": items}

    def track_channel(self, tg_id: int, username: str, title: str,
                       subscribers: int = 0):
        channel_id = self.db.add_channel(tg_id, username, title)
        if subscribers:
            self.db.add_snapshot(channel_id, subscribers)
        self._start_collect(tg_id)
        return {"ok": True, "channel_id": channel_id}

    def untrack_channel(self, tg_id: int):
        row = None
        for r in self.db.list_channels():
            if r["tg_id"] == tg_id:
                row = r
                break
        if row:
            self.db.remove_channel(row["id"])
        return {"ok": True}

    def resolve_channel(self, identifier: str):
        if not identifier or not str(identifier).strip():
            return {"ok": False, "message": "empty identifier"}

        def on_log(msg):
            self.emit("log", level="info", message=msg)

        r = self.worker.resolve_channel(str(identifier).strip(), on_log)
        if not r["ok"]:
            return {"ok": False, "message": r["message"]}
        return {"ok": True, "channel": r["data"]}

    def add_public_channel(self, identifier: str):
        if not identifier or not str(identifier).strip():
            return {"ok": False, "message": "empty identifier"}

        def on_log(msg):
            self.emit("log", level="info", message=msg)

        r = self.worker.resolve_channel(str(identifier).strip(), on_log)
        if not r["ok"]:
            return {"ok": False, "message": r["message"]}

        ch = r["data"]
        existing = self.db.get_channel_by_tg_id(ch["tg_id"])
        if existing:
            return {
                "ok": False,
                "message": "already_tracked",
                "channel": {
                    "title": existing["title"],
                    "username": existing["username"] or "",
                },
            }

        channel_id = self.db.add_channel(
            ch["tg_id"], ch["username"], ch["title"], is_public=1,
        )
        if ch.get("participants_count"):
            self.db.add_snapshot(channel_id, ch["participants_count"])

        self._start_collect(ch["tg_id"])

        return {
            "ok": True,
            "channel_id": channel_id,
            "channel": ch,
        }

    def collect_channel_now(self, tg_id: int):
        self._start_collect(tg_id, manual=True)
        return {"ok": True}

    def collect_one_sync(self, tg_id: int, max_posts: int = 100) -> bool:
        def on_log(msg):
            self.emit("log", level="info", message=msg)
        try:
            r = self.worker.collect_channel(tg_id, on_log, max_posts=max_posts)
        except Exception as e:
            log.exception("collect_one_sync failed for tg_id=%s", tg_id)
            self.emit("channels.collect_failed", tg_id=tg_id, message=str(e))
            return False

        if r["ok"] and r["data"]:
            data = r["data"]
            channel_id = self.db.add_channel(
                tg_id, data["username"], data["title"],
            )
            self.db.add_snapshot(channel_id, data["subscribers"])
            for post in data["posts"]:
                self.db.upsert_post(channel_id, post)

            self.emit(
                "channels.collected",
                tg_id=tg_id,
                subscribers=data["subscribers"],
                posts=len(data["posts"]),
            )
            return True
        else:
            self.emit(
                "channels.collect_failed",
                tg_id=tg_id,
                message=r.get("message", "unknown"),
            )
            return False

    def _start_collect(self, tg_id: int, manual: bool = False):
        with self._collecting_lock:
            if tg_id in self._collecting:
                return
            self._collecting.add(tg_id)

        def _run():
            try:
                self.collect_one_sync(tg_id, max_posts=100)
            finally:
                with self._collecting_lock:
                    self._collecting.discard(tg_id)

        threading.Thread(target=_run, daemon=True).start()

    def get_dashboard(self, channel_id: int, days: int = 30):
        try:
            channel_id = int(channel_id)
            days = int(days)
        except (ValueError, TypeError):
            return {"ok": False, "message": "invalid params"}

        if days not in (0, 7, 30, 90):
            days = 30

        data = compute_dashboard(self.db, channel_id, days=days)
        if not data:
            return {"ok": False, "message": "channel not found"}
        return {"ok": True, "data": data}

    def compare_channels(self, channel_ids, days=30):
        try:
            if isinstance(channel_ids, str):
                channel_ids = json.loads(channel_ids)
            channel_ids = [int(x) for x in channel_ids]
            days = int(days)
        except (ValueError, TypeError, json.JSONDecodeError):
            return {"ok": False, "message": "invalid params"}

        if days not in (0, 7, 30, 90):
            days = 30
        if len(channel_ids) < 2:
            return {"ok": False, "message": "need at least 2 channels"}
        if len(channel_ids) > 6:
            channel_ids = channel_ids[:6]

        from .analytics import compare_channels as _cc
        data = _cc(self.db, channel_ids, days=days)
        return {"ok": True, "data": data}

    def open_external_url(self, url: str):
        import webbrowser
        try:
            webbrowser.open(str(url))
            return True
        except Exception:
            return False

    def export_channel_data(self, channel_id, days, fmt):
        if not self._window:
            return {"ok": False, "message": "no window"}
        try:
            channel_id = int(channel_id)
            days = int(days)
        except (ValueError, TypeError):
            return {"ok": False, "message": "invalid params"}
        if fmt not in ("csv", "json", "pdf"):
            return {"ok": False, "message": "unknown format"}

        if days not in (0, 7, 30, 90):
            days = 30

        channel = self.db.get_channel(channel_id)
        if not channel:
            return {"ok": False, "message": "channel not found"}

        raw_name = channel["title"] or channel["username"] or "channel"
        safe_name = "".join(
            c if c.isalnum() or c in "._- " else "_"
            for c in raw_name
        ).strip() or "channel"
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        default_name = f"{safe_name}_{days}d_{ts}.{fmt}"

        try:
            if fmt == "csv":
                file_types = ("CSV files (*.csv)",)
            elif fmt == "json":
                file_types = ("JSON files (*.json)",)
            else:
                file_types = ("PDF files (*.pdf)",)

            result = self._window.create_file_dialog(
                webview.SAVE_DIALOG,
                directory=self.config.export_dir,
                save_filename=default_name,
                file_types=file_types,
            )
        except Exception as e:
            return {"ok": False, "message": str(e)}

        if not result:
            return {"ok": False, "message": "cancelled"}

        path = result if isinstance(result, str) else result[0]

        try:
            if fmt == "csv":
                self._write_csv(path, channel_id, days)
            elif fmt == "json":
                self._write_json(path, channel_id, days)
            else:
                from .exports.pdf_report import generate_channel_report
                lang = self.config.language or "en"
                generate_channel_report(
                    self.db, channel_id, days, path, lang=lang,
                )
        except Exception as e:
            log.exception("Export failed (%s)", fmt)
            return {"ok": False, "message": str(e)}

        return {"ok": True, "path": path}

    def _write_csv(self, path: str, channel_id: int, days: int):
        posts = self.db.posts_since(channel_id, days)
        channel = self.db.get_channel(channel_id)

        if channel:
            label = (channel["username"]
                     or channel["title"]
                     or f"id {channel['tg_id']}")
        else:
            label = "channel"

        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
            w.writerow([
                "channel", "date", "msg_id", "views", "reactions",
                "forwards", "media_type", "text",
            ])
            for p in posts:
                w.writerow([
                    label,
                    p["date"] or "",
                    p["tg_msg_id"],
                    p["views"],
                    p["reactions"],
                    p["forwards"],
                    p["media_type"] or "text",
                    (p["text"] or "").replace("\n", " ")[:500],
                ])

    def _write_json(self, path: str, channel_id: int, days: int):
        from .analytics import compute_dashboard
        data = compute_dashboard(self.db, channel_id, days=days)
        channel = self.db.get_channel(channel_id)

        display_username = ""
        display_title = ""
        if channel:
            display_title = channel["title"] or ""
            display_username = channel["username"] or ""

        if "channel" in data:
            data["channel"]["title"] = display_title or data["channel"].get("title", "")
            data["channel"]["username"] = display_username

        data["generated_at"] = datetime.now().isoformat()
        data["period_days"] = days
        data["channel_raw"] = {
            "id": channel["id"] if channel else None,
            "tg_id": channel["tg_id"] if channel else None,
            "username": display_username,
            "title": display_title,
            "is_public": bool(channel["is_public"]) if channel and "is_public" in channel.keys() else False,
            "tracked_at": channel["tracked_at"] if channel else None,
        }
        data["snapshots"] = [
            {
                "timestamp": r["timestamp"],
                "subscribers": r["subscribers"],
            }
            for r in self.db.snapshots_since(channel_id, days)
        ]
        data["posts"] = [
            {
                "tg_msg_id": r["tg_msg_id"],
                "date": r["date"],
                "views": r["views"],
                "reactions": r["reactions"],
                "forwards": r["forwards"],
                "media_type": r["media_type"] or "text",
                "text": r["text"] or "",
            }
            for r in self.db.posts_since(channel_id, days)
        ]

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)

    @staticmethod
    def _qr_to_data_url(url: str) -> str:
        import qrcode
        qr = qrcode.QRCode(box_size=10, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
