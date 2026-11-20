"""Voice Receptionist Agent — database layer (SQLite by default)."""
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "receptionist.db")
DB_PATH = os.path.abspath(DB_PATH)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
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
