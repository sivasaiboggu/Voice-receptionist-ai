"""Voice Receptionist Agent — database layer.

SQLite by default; Postgres when ``DATABASE_URL`` starts with
``postgres://`` or ``postgresql://``. The URL comes from the environment
only — no credentials are hardcoded. The schema is created on first
connect (``CREATE TABLE IF NOT EXISTS`` — the migration is idempotent,
no separate migration step).

Both backends expose the sqlite3 surface the callers use:
``conn.execute(sql, params)`` with ``?`` placeholders, ``.fetchone()`` /
``.fetchall()``, ``.rowcount``, rows that support both ``row[0]`` and
``row["column"]`` (and ``dict(row)``), plus ``conn.commit()`` /
``conn.close()``. The Postgres wrapper translates ``?`` to ``%s`` and
rewrites SQLite-only ``INSERT OR IGNORE`` to ``ON CONFLICT DO NOTHING``,
so no caller had to change.

SQLite specifics kept as-is: ``DATABASE_URL`` may also be a
``sqlite:///...`` URL (relative to the working directory, which is the
repo root when running uvicorn/docker compose) or ``sqlite:///:memory:``.
An explicit path passed to ``init_db()`` (tests use scratch files) is
always SQLite, even when Postgres is configured.
"""
import os
import re
import sqlite3
from contextlib import contextmanager

SQLITE_SCHEMA = """
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

# Same tables for Postgres; only the auto-incrementing id differs
# (INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL).
PG_SCHEMA = """
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    caller TEXT, started_at TEXT, duration_seconds INTEGER DEFAULT 0,
    transcript TEXT, summary TEXT, sentiment TEXT, urgency TEXT,
    outcome TEXT, escalated INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_name TEXT, phone TEXT, service TEXT,
    slot TEXT UNIQUE, status TEXT DEFAULT 'booked',
    created_at TEXT, confirmation_sent INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    caller TEXT, message TEXT, created_at TEXT, handled INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS slots (
    slot TEXT PRIMARY KEY, service TEXT, available INTEGER DEFAULT 1
);
"""


def postgres_url():
    """The configured Postgres URL, or "" when SQLite is in use."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if url.startswith(("postgres://", "postgresql://")):
        return url
    return ""


def database_kind():
    """'postgres' when DATABASE_URL points at Postgres, else 'sqlite'."""
    return "postgres" if postgres_url() else "sqlite"


def _resolve_db_path():
    """SQLite file to use.

    Honours ``DATABASE_URL`` when it is a ``sqlite: <redacted>
    ``sqlite:///./receptionist.db`` (relative to the working directory,
    which is the repo root when running uvicorn/docker compose) or
    ``sqlite:////var/data/receptionist.db``. Any other scheme (notably
    Postgres) is NOT a file path — it falls back to the default SQLite
    file, and the Postgres path is handled by :func:`postgres_url`
    instead. See ``.env.example``.
    """
    url = os.environ.get("DATABASE_URL", "").strip()
    if url.startswith("sqlite:///"):
        path = url[len("sqlite:///"):]
        if path == ":memory:":
            return path
        return os.path.abspath(path)
    return os.path.join(os.path.dirname(__file__), "..", "..", "receptionist.db")


DB_PATH = os.path.abspath(_resolve_db_path())


# ---------------------------------------------------------------------------
# Postgres compatibility wrapper (psycopg, sqlite3 surface)
# ---------------------------------------------------------------------------

def _translate_sql(sql):
    """Rewrite SQLite-dialect SQL to Postgres dialect.

    - ``?`` placeholders -> ``%s`` (none of our queries has a literal
      ``?`` inside a string, so a plain replace is safe here).
    - ``INSERT OR IGNORE INTO t ...`` -> ``INSERT INTO t ...
      ON CONFLICT DO NOTHING`` (used for idempotent slot seeding).
    - ``INSERT OR REPLACE INTO t ...`` -> ``INSERT INTO t ...
      ON CONFLICT (...) DO UPDATE ...`` (not used by this app today,
      kept so the translation stays complete).
    """
    sql = sql.strip()
    if re.match(r"INSERT OR IGNORE INTO", sql, re.IGNORECASE):
        sql = re.sub(r"INSERT OR IGNORE INTO", "INSERT INTO", sql,
                     count=1, flags=re.IGNORECASE).rstrip()
        if sql.endswith(")"):
            sql += " ON CONFLICT DO NOTHING"
    elif re.match(r"INSERT OR REPLACE INTO", sql, re.IGNORECASE):
        m = re.match(
            r"INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)",
            sql, re.IGNORECASE | re.DOTALL,
        )
        if m:
            table, cols_raw, vals_raw = m.group(1), m.group(2), m.group(3)
            cols = [c.strip() for c in cols_raw.split(",")]
            # The only REPLACE-able table here is keyed on its first column.
            key = [cols[0]]
            rest = sql[m.end():]
            assignments = ", ".join(
                f"{c}=EXCLUDED.{c}" for c in cols if c not in key
            )
            sql = (
                f"INSERT INTO {table} ({', '.join(cols)}) "
                f"VALUES ({vals_raw}) ON CONFLICT ({', '.join(key)}) "
                f"DO UPDATE SET {assignments}{rest}"
            )
    return sql.replace("?", "%s")


class _Row(tuple):
    """A result row that acts like both a tuple and sqlite3.Row.

    ``row[0]`` and ``row["column"]`` both work, and ``dict(row)`` builds
    a ``{column: value}`` mapping, as the API and booking code rely on.
    """

    def __new__(cls, values, columns):
        self = super().__new__(cls, tuple(values))
        self._columns = tuple(columns)
        return self

    def __getitem__(self, key):
        if isinstance(key, str):
            return super().__getitem__(self._columns.index(key))
        return super().__getitem__(key)

    def keys(self):
        return list(self._columns)


class _PGCursor:
    """Wraps a psycopg cursor; rows come back as :class:`_Row`."""

    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=None):
        self._cur.execute(_translate_sql(sql), params or ())
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        cols = [d.name for d in self._cur.description]
        return _Row(row, cols)

    def fetchall(self):
        cols = [d.name for d in self._cur.description]
        return [_Row(r, cols) for r in self._cur.fetchall()]

    @property
    def rowcount(self):
        return self._cur.rowcount

    def close(self):
        self._cur.close()


class _PGConnection:
    """Wraps a psycopg connection with the sqlite3 surface callers use."""

    is_postgres = True

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        return _PGCursor(self._conn.cursor()).execute(sql, params)

    def executescript(self, script):
        with self._conn.cursor() as cur:
            cur.execute(script)
        return self

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        if exc[0] is None:
            self.commit()
        else:
            self.rollback()
        self.close()
        return False


def _connect_postgres(url):
    try:
        import psycopg
    except ImportError as e:  # pragma: no cover - missing dependency
        raise RuntimeError(
            "DATABASE_URL points at Postgres but psycopg is not installed; "
            "install it with: pip install 'psycopg[binary]'"
        ) from e
    conn = _PGConnection(psycopg.connect(url))
    conn.executescript(PG_SCHEMA)
    conn.commit()
    return conn


def get_conn():
    url = postgres_url()
    if url:
        return _connect_postgres(url)
    # timeout=30 so a locked SQLite file waits instead of failing instantly
    # under uvicorn's thread pool; each request still gets its own connection.
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path=DB_PATH):
    # Postgres configured and no explicit file given -> create the
    # Postgres schema. An explicit path is always a SQLite file.
    if postgres_url() and db_path == DB_PATH:
        conn = _connect_postgres(postgres_url())
        conn.close()
        return
    conn = sqlite3.connect(db_path)
    conn.executescript(SQLITE_SCHEMA)
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


# Advisory-lock key for booking mutations (Postgres) — any fixed integer.
BOOKING_LOCK_KEY = 20261121


def acquire_booking_lock(conn):
    """Serialise booking mutations for the current transaction.

    Booking is check-then-claim: the overlap check reads booked
    intervals and the claim flips a slot row. Two requests for
    overlapping-but-different slots could both pass the check before
    either claimed, and the atomic slot claim only protects the *same*
    slot — so the overlap window was a real double-booking race. The
    lock closes it on both backends, and is released when the
    transaction commits (``db()``) or rolls back:
    - SQLite: ``BEGIN IMMEDIATE`` takes the database write lock up
      front. A deferred transaction would only lock at the first
      write, i.e. after the check — too late.
    - Postgres: a transaction-scoped advisory lock; every booking
      mutation takes the same key, so they serialise.
    A Postgres EXCLUDE constraint was considered and rejected: SQLite
    (the default backend) has no exclusion constraints, and a
    Postgres-only constraint would leave the default path racy while
    needing range columns the schema does not have.
    """
    if getattr(conn, "is_postgres", False):
        conn.execute("SELECT pg_advisory_xact_lock(?)", (BOOKING_LOCK_KEY,))
    elif not conn.in_transaction:
        conn.execute("BEGIN IMMEDIATE")
