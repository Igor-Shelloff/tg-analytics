import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from .config import DB_FILE

SCHEMA = """
CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY,
    tg_id       INTEGER UNIQUE,
    username    TEXT,
    title       TEXT,
    is_public   INTEGER DEFAULT 0,
    tracked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY,
    channel_id  INTEGER NOT NULL,
    timestamp   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subscribers INTEGER,
    FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY,
    channel_id  INTEGER NOT NULL,
    tg_msg_id   INTEGER NOT NULL,
    date        TIMESTAMP,
    text        TEXT,
    views       INTEGER DEFAULT 0,
    reactions   INTEGER DEFAULT 0,
    forwards    INTEGER DEFAULT 0,
    has_media   INTEGER DEFAULT 0,
    media_type  TEXT,
    UNIQUE(channel_id, tg_msg_id),
    FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_channel_time
    ON snapshots(channel_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_posts_channel_date
    ON posts(channel_id, date);
CREATE INDEX IF NOT EXISTS idx_posts_channel_views
    ON posts(channel_id, views DESC);
"""

class Database:
    def __init__(self, path: Path = DB_FILE):
        self._path = path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._init_schema()
        self._migrate()

    def _init_schema(self):
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    def _migrate(self):
        with self._lock:
            cur = self._conn.cursor()
            try:
                cur.execute("PRAGMA table_info(channels)")
                cols = {row[1] for row in cur.fetchall()}
                if "is_public" not in cols:
                    cur.execute(
                        "ALTER TABLE channels "
                        "ADD COLUMN is_public INTEGER DEFAULT 0"
                    )
                self._conn.commit()
            except Exception:
                self._conn.rollback()
            finally:
                cur.close()

    @contextmanager
    def _cursor(self):
        with self._lock:
            cur = self._conn.cursor()
            try:
                yield cur
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise
            finally:
                cur.close()

    def add_channel(self, tg_id: int, username: str, title: str,
                     is_public: int = 0) -> int:
        with self._cursor() as cur:
            cur.execute(
                "INSERT OR IGNORE INTO channels"
                "(tg_id, username, title, is_public) VALUES (?,?,?,?)",
                (tg_id, username, title, int(is_public)),
            )
            cur.execute("SELECT id FROM channels WHERE tg_id = ?", (tg_id,))
            return cur.fetchone()["id"]

    def list_channels(self) -> List[sqlite3.Row]:
        with self._cursor() as cur:
            cur.execute("SELECT * FROM channels ORDER BY title COLLATE NOCASE")
            return cur.fetchall()

    def remove_channel(self, channel_id: int):
        with self._cursor() as cur:
            cur.execute("DELETE FROM channels WHERE id = ?", (channel_id,))

    def get_channel(self, channel_id: int) -> Optional[sqlite3.Row]:
        with self._cursor() as cur:
            cur.execute("SELECT * FROM channels WHERE id = ?", (channel_id,))
            return cur.fetchone()

    def get_channel_by_tg_id(self, tg_id: int) -> Optional[sqlite3.Row]:
        with self._cursor() as cur:
            cur.execute("SELECT * FROM channels WHERE tg_id = ?", (tg_id,))
            return cur.fetchone()

    def add_snapshot(self, channel_id: int, subscribers: int):
        with self._cursor() as cur:
            cur.execute(
                "INSERT INTO snapshots(channel_id, subscribers) VALUES (?,?)",
                (channel_id, subscribers),
            )

    def latest_snapshot(self, channel_id: int) -> Optional[sqlite3.Row]:
        with self._cursor() as cur:
            cur.execute(
                "SELECT * FROM snapshots WHERE channel_id = ? "
                "ORDER BY timestamp DESC LIMIT 1",
                (channel_id,),
            )
            return cur.fetchone()

    def snapshots_since(self, channel_id: int,
                         days: int) -> List[sqlite3.Row]:
        with self._cursor() as cur:
            if days and days > 0:
                cutoff = (datetime.utcnow() -
                          timedelta(days=days)).isoformat(sep=" ")
                cur.execute(
                    "SELECT * FROM snapshots WHERE channel_id = ? "
                    "AND timestamp >= ? ORDER BY timestamp ASC",
                    (channel_id, cutoff),
                )
            else:
                cur.execute(
                    "SELECT * FROM snapshots WHERE channel_id = ? "
                    "ORDER BY timestamp ASC",
                    (channel_id,),
                )
            return cur.fetchall()

    def upsert_post(self, channel_id: int, post: dict):
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO posts(channel_id, tg_msg_id, date, text, views,
                                  reactions, forwards, has_media, media_type)
                VALUES (:channel_id, :tg_msg_id, :date, :text, :views,
                        :reactions, :forwards, :has_media, :media_type)
                ON CONFLICT(channel_id, tg_msg_id) DO UPDATE SET
                    views     = excluded.views,
                    reactions = excluded.reactions,
                    forwards  = excluded.forwards
                """,
                {"channel_id": channel_id, **post},
            )

    def posts_since(self, channel_id: int, days: int) -> List[sqlite3.Row]:
        with self._cursor() as cur:
            if days and days > 0:
                cutoff = (datetime.utcnow() -
                          timedelta(days=days)).isoformat(sep=" ")
                cur.execute(
                    "SELECT * FROM posts WHERE channel_id = ? AND date >= ? "
                    "ORDER BY date ASC",
                    (channel_id, cutoff),
                )
            else:
                cur.execute(
                    "SELECT * FROM posts WHERE channel_id = ? "
                    "ORDER BY date ASC",
                    (channel_id,),
                )
            return cur.fetchall()

    def top_posts(self, channel_id: int, days: int = 30,
                  limit: int = 10) -> List[sqlite3.Row]:
        with self._cursor() as cur:
            if days and days > 0:
                cutoff = (datetime.utcnow() -
                          timedelta(days=days)).isoformat(sep=" ")
                cur.execute(
                    "SELECT * FROM posts WHERE channel_id = ? AND date >= ? "
                    "ORDER BY views DESC LIMIT ?",
                    (channel_id, cutoff, limit),
                )
            else:
                cur.execute(
                    "SELECT * FROM posts WHERE channel_id = ? "
                    "ORDER BY views DESC LIMIT ?",
                    (channel_id, limit),
                )
            return cur.fetchall()

    def last_posts(self, channel_id: int,
                    limit: int = 20) -> List[sqlite3.Row]:
        with self._cursor() as cur:
            cur.execute(
                "SELECT * FROM posts WHERE channel_id = ? "
                "ORDER BY date DESC LIMIT ?",
                (channel_id, limit),
            )
            return cur.fetchall()

    def purge_older_than(self, days: int):
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat(sep=" ")
        with self._cursor() as cur:
            cur.execute("DELETE FROM snapshots WHERE timestamp < ?", (cutoff,))
            cur.execute("DELETE FROM posts WHERE date < ?", (cutoff,))

    def delete_all_tracked(self):
        with self._cursor() as cur:
            cur.execute("DELETE FROM channels")

    def storage_stats(self) -> dict:
        with self._cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM channels")
            channels = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM snapshots")
            snapshots = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM posts")
            posts = cur.fetchone()["c"]
        return {
            "channels": channels,
            "snapshots": snapshots,
            "posts": posts,
        }

    def close(self):
        with self._lock:
            self._conn.close()
