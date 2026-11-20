"""Voice Receptionist Agent — database layer (SQLite by default)."""
import os
import sqlite3
from contextlib import contextmanager


def _resolve_db_path():
    """SQLite file to use.

    Honours ``DATABASE_URL`` when it is a ``sqlite://`` URL, e.g.
    ``sqlite:///./receptionist.db`` (relative to the working directory,
    which is the repo root when running uvicorn/docker compose) or
    ``sqlite:////var/data/receptionist.db``. Any other scheme (notably
    Postgres) is NOT supported by this layer — it falls back to the
    default SQLite file instead of silently pointing at the wrong
    database. See ``.env.example``.
    """
    url = os.environ.get("DATABASE_URL", "").strip()
    if url.startswith("sqlite:///"):
        path = url[len("sqlite:///"):]
        if path == ":memory:":
            return path
        return os.path.abspath(path)
    return os.path.join(os.path.dirname(__file__), "..", "..", "receptionist.db")


DB_PATH = os.path.abspath(_resolve_db_path())


def get_conn():
    # timeout=30 so a locked SQLite file waits instead of failing instantly
    # under uvicorn's thread pool; each request still gets its own connection.
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller TEXT, started_at TEXT, duration_seconds INTEGER DEFAULT 0,
            transcript TEXT, summary TEXT, sentiment TEXT, urgency TEXT,
            outcome TEXT, escalated INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_name TEXT, phone TEXT, service TEXT,
            slot TEXT UNIQUE, status TEXT DEFAULT 'booked',
            created_at TEXT, confirmation_sent INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller TEXT, message TEXT, created_at TEXT, handled INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS slots (
            slot TEXT PRIMARY KEY, service TEXT, available INTEGER DEFAULT 1
        );
        """
    )
    conn.commit()
    conn.close()


@contextmanager
def db():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
