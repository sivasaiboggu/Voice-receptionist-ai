"""Tests: service durations occupy real time (round 7).

A 45-minute cleaning starting at 10:00 runs to 10:45, so the 10:30
slot is not free for anyone, and a 60-minute root canal starting at
13:00 runs into the 13:30 lunch break, so it cannot be offered or
booked at all. Before this round only the starting slot was marked
unavailable, so the dentist's time was double-booked, and
available_slots(service=...) accepted a service and then ignored it.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from backend.app import agent as va
from backend.app import booking
from backend.app.db import init_db

TEST_DB = "/tmp/test_receptionist_overlap.db"


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)
    import backend.app.db as dbmod

    monkeypatch.setattr(dbmod, "DB_PATH", TEST_DB)
    booking.seed_slots()
    yield


def _next_weekday():
    """A Mon-Fri date at least tomorrow, so its 10:00 slot is seeded
    (seed covers 7 days) and safely in the future whatever day the
    suite runs."""
    day = booking.now_clinic().date() + timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def _slot(day, time):
    return f"{day.isoformat()} {time}"


def test_cleaning_blocks_next_slot():
    day = _next_weekday()
    ok, msg = booking.book("Asha", "+91 90000 00001", "Teeth cleaning", _slot(day, "10:00"))
    assert ok is True, msg
    # 10:30 starts inside the cleaning (10:00-10:45): not offered, not bookable.
    assert _slot(day, "10:30") not in booking.available_slots(limit=100)
    ok, msg = booking.book("Ravi", "+91 90000 00002", "General checkup", _slot(day, "10:30"))
    assert ok is False
    assert "overlap" in msg.lower()
    # 11:00 is clear again.
    assert _slot(day, "11:00") in booking.available_slots(limit=100)


def test_root_canal_blocks_next_slot_but_not_the_one_after():
    day = _next_weekday()
    ok, msg = booking.book("Asha", "+91 90000 00001", "Root canal treatment", _slot(day, "10:00"))
    assert ok is True, msg
    assert _slot(day, "10:30") not in booking.available_slots(limit=100)
    assert _slot(day, "11:00") in booking.available_slots(limit=100)


def test_cancel_frees_the_overlapped_slot():
    day = _next_weekday()
    booking.book("Asha", "+91 90000 00001", "Teeth cleaning", _slot(day, "10:00"))
    assert _slot(day, "10:30") not in booking.available_slots(limit=100)
    ok, _ = booking.cancel(_slot(day, "10:00"))
    assert ok is True
    assert _slot(day, "10:30") in booking.available_slots(limit=100)


def test_validate_rejects_service_running_into_lunch():
    day = _next_weekday()
    # Root canal 13:00-14:00 runs into lunch (13:30-14:30).
    _, _, error = booking.validate_booking(
        "Asha", "+91 90000 00001", "Root canal treatment", _slot(day, "13:00")
    )
    assert error is not None and "lunch" in error.lower()
    # A 30-minute checkup 13:00-13:30 ends exactly as lunch starts: fine.
    _, _, error = booking.validate_booking(
        "Asha", "+91 90000 00001", "General checkup", _slot(day, "13:00")
    )
    assert error is None
    # A 45-minute cleaning at 12:30 ends 13:15, before lunch: fine.
    _, _, error = booking.validate_booking(
        "Asha", "+91 90000 00001", "Teeth cleaning", _slot(day, "12:30")
    )
    assert error is None


def test_validate_rejects_service_running_past_closing():
    day = _next_weekday()
    # Root canal 19:30-20:30 runs past the 8 PM close.
    _, _, error = booking.validate_booking(
        "Asha", "+91 90000 00001", "Root canal treatment", _slot(day, "19:30")
    )
    assert error is not None and "closing" in error.lower()
    # A 30-minute checkup at 19:30 ends exactly at closing: fine.
    _, _, error = booking.validate_booking(
        "Asha", "+91 90000 00001", "General checkup", _slot(day, "19:30")
    )
    assert error is None


def test_book_rejects_slot_outside_hours():
    day = _next_weekday()
    # 13:30 is lunch: no slot row exists, so book() rejects it via the
    # slot lookup even though validate_booking (input checks only) passes.
    _, _, error = booking.validate_booking(
        "Asha", "+91 90000 00001", "General checkup", _slot(day, "13:30")
    )
    assert error is None
    ok, msg = booking.book("Asha", "+91 90000 00001", "General checkup", _slot(day, "13:30"))
    assert ok is False
    assert "opening hours" in msg or "outside our hours" in msg


def test_available_slots_service_param_is_honoured():
    day = _next_weekday()
    # 13:00 fits a 30-minute checkup but not a 60-minute root canal.
    assert _slot(day, "13:00") in booking.available_slots("General checkup", limit=100)
    assert _slot(day, "13:00") not in booking.available_slots("Root canal treatment", limit=100)
    # Unknown service has no slots rather than silently ignoring the filter.
    assert booking.available_slots("Brain surgery", limit=100) == []


def test_book_rejects_lunch_overrun():
    day = _next_weekday()
    ok, msg = booking.book("Asha", "+91 90000 00001", "Root canal treatment", _slot(day, "13:00"))
    assert ok is False
    assert "lunch" in msg.lower()


# --- Agent behaviour around the new rules ---

def test_agent_slot_then_service_then_name_books():
    day = _next_weekday()
    ag = va.VoiceAgent(caller="+91 90000 00011")
    ag.greet()
    reply = ag.handle(f"Book {_slot(day, '10:00')}")
    assert "which service" in reply
    reply = ag.handle("Teeth cleaning")
    assert "your name" in reply
    ag.handle("Asha")
    assert ag.outcome == "booked"
    assert ag.follow_up_sms and "Asha" in ag.follow_up_sms


def test_agent_slot_then_name_asks_service_not_rag_fallback():
    day = _next_weekday()
    ag = va.VoiceAgent(caller="+91 90000 00012")
    ag.greet()
    ag.handle(f"Book {_slot(day, '10:00')}")
    reply = ag.handle("Asha")
    assert "which service" in reply
    assert "don't have that information" not in reply
    reply = ag.handle("Teeth cleaning")
    assert "your name" in reply
    ag.handle("Asha")
    assert ag.outcome == "booked"


def test_agent_named_slot_overrun_offers_alternatives():
    day = _next_weekday()
    ag = va.VoiceAgent(caller="+91 90000 00013")
    ag.greet()
    reply = ag.handle(f"Book root canal on {_slot(day, '13:00')}")
    assert "lunch" in reply.lower()
    assert "are: ." not in reply
    assert "next available times are:" in reply


def test_agent_empty_slot_list_is_honest(monkeypatch):
    monkeypatch.setattr(booking, "available_slots", lambda limit=5, service=None: [])
    ag = va.VoiceAgent(caller="+91 90000 00014")
    ag.greet()
    reply = ag.handle("I want to book an appointment")
    assert "no free appointments" in reply
    assert "are: ." not in reply
    # Same for a named past slot: no dangling empty list.
    reply = ag.handle("Book teeth cleaning on 2020-01-01 10:00")
    assert "no free appointments" in reply
    assert "are: ." not in reply


def test_end_call_uses_whole_call_signals():
    ag = va.VoiceAgent(caller="+91 90000 00015")
    ag.greet()
    ag.handle("I am in terrible pain and bleeding")
    ag.handle("Thanks, that's great")
    result = ag.end_call()
    # The last turn was positive, but the call was an emergency: the
    # logged signals must reflect the whole call, not the last turn.
    assert result["sentiment"] == "negative"
    assert result["urgency"] == "high"
    assert result["escalated"] is True
