"""Tests — Postgres backend for backend/app/db.py (v0.3.1).

Translation + row-shape tests run with no server. Live tests run only
when ``VOICE_TEST_POSTGRES_URL`` is set (e.g. a local Postgres), and are
skipped otherwise, so the default suite stays SQLite-only and fast.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from backend.app import db as dbmod

PG_URL = os.environ.get("VOICE_TEST_POSTGRES_URL", "")


def test_translate_insert_or_ignore():
    sql = dbmod._translate_sql("INSERT OR IGNORE INTO slots (slot) VALUES (?)")
    assert sql == "INSERT INTO slots (slot) VALUES (%s) ON CONFLICT DO NOTHING"


def test_translate_placeholders():
    assert dbmod._translate_sql(
        "SELECT slot FROM slots WHERE available=1 AND slot > ? ORDER BY slot LIMIT ?"
    ) == "SELECT slot FROM slots WHERE available=1 AND slot > %s ORDER BY slot LIMIT %s"


def test_row_supports_index_key_and_dict():
    row = dbmod._Row(("2026-11-21 10:00", 1), ("slot", "available"))
    assert row[0] == "2026-11-21 10:00"
    assert row["slot"] == "2026-11-21 10:00"
    assert row["available"] == 1
    assert dict(row) == {"slot": "2026-11-21 10:00", "available": 1}


def test_database_kind_follows_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/db")
    assert dbmod.database_kind() == "postgres"
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./receptionist.db")
    assert dbmod.database_kind() == "sqlite"
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert dbmod.database_kind() == "sqlite"


@pytest.fixture()
def pg_env(monkeypatch):
    if not PG_URL:
        pytest.skip("VOICE_TEST_POSTGRES_URL not set — live Postgres test skipped")
    monkeypatch.setenv("DATABASE_URL", PG_URL)
    dbmod.init_db()
    with dbmod.db() as conn:
        for table in ("calls", "appointments", "messages", "slots"):
            conn.execute(f"DELETE FROM {table}")
    yield
    with dbmod.db() as conn:
        for table in ("calls", "appointments", "messages", "slots"):
            conn.execute(f"DELETE FROM {table}")


def test_postgres_booking_flow(pg_env):
    from backend.app import booking

    assert dbmod.database_kind() == "postgres"
    booking.seed_slots()  # INSERT OR IGNORE twice must not duplicate
    booking.seed_slots()
    slots = booking.available_slots(limit=5)
    assert len(slots) == 5
    slot = slots[0]

    ok, msg = booking.book("Test Patient", "+919573719115", "Teeth cleaning", slot)
    assert ok, msg
    # Double-booking the same slot is rejected atomically.
    ok2, _ = booking.book("Someone Else", "+919573719116", "Teeth cleaning", slot)
    assert ok2 is False

    appts = booking.list_appointments()
    assert len(appts) == 1
    assert appts[0]["patient_name"] == "Test Patient"
    assert appts[0]["slot"] == slot

    ok, _ = booking.cancel(slot)
    assert ok is True
    # Cancel frees the slot for a re-book.
    ok, _ = booking.book("Test Patient", "+919573719115", "Teeth cleaning", slot)
    assert ok is True


def test_postgres_api_row_shapes(pg_env):
    # Rows support ["col"] access (analytics) and dict(row) (/calls).
    with dbmod.db() as conn:
        conn.execute(
            "INSERT INTO calls (caller, started_at, transcript, summary, sentiment, urgency, outcome, escalated) "
            "VALUES (?,?,?,?,?,?,?,?)",
            ("+911234567890", "2026-11-21T10:00:00", "hi", "greeting", "neutral", "low", "answered", 0),
        )
        total = conn.execute("SELECT COUNT(*) c FROM calls").fetchone()["c"]
        assert total == 1
        rows = conn.execute("SELECT * FROM calls ORDER BY id DESC LIMIT 50").fetchall()
        assert dict(rows[0])["caller"] == "+911234567890"
        assert rows[0][0] is not None  # index access still works
