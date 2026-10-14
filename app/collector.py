import threading
from datetime import datetime

from .logger import get_logger

log = get_logger("collector")

class Collector:
    def __init__(self, api):
        self.api = api
        self.config = api.config
        self._stop = threading.Event()
        self._thread = None
        self._lock = threading.Lock()
        self._last_run = None
        self._last_purge_day = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="collector",
        )
        self._thread.start()
        log.info("Collector started")

    def stop(self):
        self._stop.set()
        if self._thread:
            try:
                self._thread.join(timeout=3)
            except Exception:
                pass
        log.info("Collector stopped")

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def get_last_run(self):
        return self._last_run

    def get_next_run_seconds(self):
        interval = int(self.config.collect_interval_min or 0)
        if interval <= 0:
            return None
        last = self._last_run
        if not last:
            return None
        try:
            last_dt = datetime.fromisoformat(last)
        except Exception:
            return None
        elapsed = (datetime.now() - last_dt).total_seconds()
        remaining = interval * 60 - elapsed
        return max(0, int(remaining))

    def trigger_now(self):
        log.info("Manual collect triggered")
        threading.Thread(
            target=self._run_once, daemon=True, name="collector-manual",
        ).start()

    def _loop(self):
        self._stop.wait(20)

        while not self._stop.is_set():
            interval = int(self.config.collect_interval_min or 0)

            if interval <= 0:
                self._stop.wait(60)
                continue

            log.info("Auto-collect: starting cycle (interval=%d min)", interval)
            try:
                self._run_once()
            except Exception as e:
                log.exception("Auto-collect cycle failed: %s", e)
                self.api.emit("collector.error", message=str(e))

            waited = 0
            total = interval * 60
            while waited < total and not self._stop.is_set():
                step = min(30, total - waited)
                self._stop.wait(step)
                waited += step
                new_interval = int(self.config.collect_interval_min or 0)
                if new_interval != interval:
                    log.info("Interval changed: %d → %d min",
                             interval, new_interval)
                    break

    def _run_once(self):
        self._maybe_purge()

        try:
            rows = self.api.db.list_channels()
        except Exception as e:
            log.exception("Failed to read channels: %s", e)
            return

        if not rows:
            log.info("No channels to collect")
            self._last_run = datetime.now().isoformat()
            self.api.emit("collector.finished")
            return

        total = len(rows)
        log.info("Collecting %d channel(s)", total)
        self.api.emit("collector.started", count=total)

        ok_count = 0
        fail_count = 0

        for i, row in enumerate(rows, 1):
            if self._stop.is_set():
                break
            tg_id = row["tg_id"]
            title = row["title"] or str(tg_id)

            self.api.emit("collector.progress",
                          done=i - 1, total=total,
                          index=i, title=title)

            try:
                ok = self.api.collect_one_sync(tg_id, max_posts=50)
                if ok:
                    ok_count += 1
                    self._stop.wait(3)
                else:
                    fail_count += 1
                    log.warning("Collect failed for %s (id=%s)", title, tg_id)
                    self._stop.wait(5)
            except Exception as e:
                fail_count += 1
                log.exception("Collect exception for %s: %s", title, e)
                self.api.emit("collector.error", message=str(e))
                self._stop.wait(5)

        self.api.emit("collector.progress",
                      done=total, total=total, index=total, title="")

        self._last_run = datetime.now().isoformat()
        log.info("Collect cycle done: ok=%d, failed=%d", ok_count, fail_count)
        self.api.emit("collector.finished")

    def _maybe_purge(self):
        today = datetime.now().strftime("%Y-%m-%d")
        if self._last_purge_day == today:
            return
        try:
            days = int(self.config.retention_days or 0)
            if days > 0:
                log.info("Purging data older than %d days", days)
                self.api.db.purge_older_than(days)
            self._last_purge_day = today
        except Exception as e:
            log.exception("Purge failed: %s", e)
