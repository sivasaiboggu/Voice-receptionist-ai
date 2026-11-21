"""Tests: timezone-aware booking.

The bug these pin down: booking used naive ``datetime.now()`` — the
server's local clock. On a UTC server that offered slots which had
already passed at the clinic (Asia/Kolkata, UTC+5:30) and skipped the
first clinic day when it was already tomorrow in IST. Slots are stored
as clinic-local "YYYY-MM-DD HH:MM" strings; "past" is now judged
against the clinic clock (CLINIC_TZ), and created_at stamps are UTC.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from backend.app import booking
from backend.app.db import db, init_db

TEST_DB = "/tmp/test_receptionist_tz.db"


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)
    import backend.app.db as dbmod

    monkeypatch.setattr(dbmod, "DB_PATH", TEST_DB)
    yield


@pytest.fixture()
def client():
    from backend.app.api import app

    return TestClient(app)


def _slot_string(when):
    """Format a datetime as a slot string, rounded down to :00/:30."""
    when = when.replace(second=0, microsecond=0, minute=0 if when.minute < 30 else 30)
    return when.strftime("%Y-%m-%d %H:%M")


def test_parse_slot_is_timezone_aware():
    dt = booking.parse_slot("2026-11-21 10:00")
    assert dt is not None
    assert dt.tzinfo is not None
    assert dt.tzinfo is booking.CLINIC_TZ
    # Asia/Kolkata is UTC+5:30 — the offset must be real, not a naive stand-in.
    assert dt.utcoffset() == timedelta(hours=5, minutes=30)


def test_past_in_clinic_time_is_rejected():
    past = _slot_string(booking.now_clinic() - timedelta(hours=1))
    _, _, error = booking.validate_booking("Asha", "+91 90000 00001", "General checkup", past)
    assert error is not None and "past" in error


def test_future_in_clinic_time_is_accepted():
    future = _slot_string(booking.now_clinic() + timedelta(hours=2))
    _, _, error = booking.validate_booking("Asha", "+91 90000 00001", "General checkup", future)
    assert error is None


def test_slot_future_in_utc_but_past_in_clinic_is_rejected(monkeypatch):
    # A slot one hour ahead of UTC: still "future" on a UTC server clock,
    # but 13 hours in the past in Kiritimati (UTC+14). The clinic clock
    # must win — this is the exact bug the naive code had.
    slot = _slot_string(datetime.now(timezone.utc) + timedelta(hours=1))
    monkeypatch.setattr(booking, "CLINIC_TZ", ZoneInfo("Pacific/Kiritimati"))
    _, _, error = booking.validate_booking("Asha", "+91 90000 00001", "General checkup", slot)
    assert error is not None and "past" in error


def test_same_slot_is_future_in_a_western_clinic(monkeypatch):
    # Mirror image: the same slot is 11 hours in the future in Honolulu
    # (UTC-10), so it must be accepted there.
    slot = _slot_string(datetime.now(timezone.utc) + timedelta(hours=1))
    monkeypatch.setattr(booking, "CLINIC_TZ", ZoneInfo("Pacific/Honolulu"))
    _, _, error = booking.validate_booking("Asha", "+91 90000 00001", "General checkup", slot)
    assert error is None


def test_generate_slots_starts_on_clinic_today(monkeypatch):
    monkeypatch.setattr(booking, "CLINIC_TZ", ZoneInfo("Pacific/Kiritimati"))
    today_kiritimati = datetime.now(ZoneInfo("Pacific/Kiritimati")).date().isoformat()
    slots = booking.generate_slots(days=1)
    assert slots
    assert slots[0].startswith(today_kiritimati)


def test_no_slots_during_lunch_break():
    """The KB says lunch is 13:30-14:30 with no appointments, so slot
    generation must stop at 13:00 and resume at 14:30 — the old windows
    (9-13, 14-20) offered 14:00 and 14:30 bookings during lunch."""
    from datetime import date

    slots = booking.generate_slots(days=1, start=date(2026, 11, 23))  # a Monday
    times = [s[11:] for s in slots]
    assert "13:00" in times
    assert "14:30" in times
    assert not [t for t in times if "13:30" <= t < "14:30"]
    assert "14:00" not in times


def test_available_slots_exclude_clinic_past():
    booking.seed_slots()
    past = _slot_string(booking.now_clinic() - timedelta(hours=1))
    future = _slot_string(booking.now_clinic() + timedelta(hours=2))
    with db() as conn:
        conn.execute("INSERT OR IGNORE INTO slots (slot, available) VALUES (?, 1)", (past,))
        conn.execute("INSERT OR IGNORE INTO slots (slot, available) VALUES (?, 1)", (future,))
    offered = booking.available_slots(limit=100)
    assert past not in offered
    assert future in offered


def test_book_rejects_clinic_past_slot():
    booking.seed_slots()
    past = _slot_string(booking.now_clinic() - timedelta(hours=1))
    ok, msg = booking.book("Asha", "+91 90000 00001", "General checkup", past)
    assert ok is False
    assert "past" in msg


def test_created_at_is_utc_aware():
    booking.seed_slots()
    slot = booking.available_slots(limit=1)[0]
    ok, _ = booking.book("Asha", "+91 90000 00001", "General checkup", slot)
    assert ok is True
    with db() as conn:
        row = conn.execute("SELECT created_at FROM appointments WHERE slot=?", (slot,)).fetchone()
    stamped = datetime.fromisoformat(row["created_at"])
    assert stamped.tzinfo is not None
    assert stamped.utcoffset() == timedelta(0)


def test_slots_endpoint_reports_timezone(client):
    booking.seed_slots()
    body = client.get("/slots").json()
    assert body["timezone"] == booking.clinic_tz_name()
    assert body["available"]


def test_slots_endpoint_service_filter(client):
    """?service= only offers slots the whole service fits in: a
    13:00 root canal would run into lunch, a 13:00 checkup fits."""
    from datetime import date, timedelta

    booking.seed_slots()
    day = booking.now_clinic().date() + timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    slot = f"{day.isoformat()} 13:00"
    assert slot in client.get("/slots?service=General%20checkup&limit=100").json()["available"]
    assert slot not in client.get("/slots?service=Root%20canal%20treatment&limit=100").json()["available"]
    assert client.get("/slots?service=Brain%20surgery").json()["available"] == []


def test_health_reports_timezone(client):
    assert client.get("/health").json()["timezone"] == booking.clinic_tz_name()
