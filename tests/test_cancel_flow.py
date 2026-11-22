"""Round 9 tests: the name-checked cancel flow, name introductions,
and the honest analytics numbers.

The voice agent used to cancel by time alone (any caller could cancel
anyone else's appointment by naming the slot) and to treat a booking
turn given while it waited for a time to cancel as a cancel
confirmation. Both are fixed here, and "My name is Rahul" now books
when the agent asks for a name instead of falling through to the RAG
"I don't have that information" reply.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app import agent as va
from backend.app import booking
from backend.app.db import init_db

TEST_DB = "/tmp/test_receptionist_cancel.db"


import pytest


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)
    import backend.app.db as dbmod

    monkeypatch.setattr(dbmod, "DB_PATH", TEST_DB)
    yield


def _booked_agent():
    """An agent, and a slot booked by Asha."""
    booking.seed_slots()
    slots = booking.available_slots(limit=1)
    booking.book("Asha", "+91 90000 00001", "General checkup", slots[0])
    ag = va.VoiceAgent(caller="+91 90000 00001")
    ag.greet()
    return ag, slots[0]


def test_cancel_wrong_name_does_not_cancel():
    ag, slot = _booked_agent()
    ag.handle("I want to cancel my appointment")
    ag.handle(f"Yes, cancel {slot}")
    reply = ag.handle("Ravi")
    assert ag.outcome != "cancelled"
    assert "under that name" in reply
    assert [a for a in booking.list_appointments() if a["slot"] == slot and a["status"] == "booked"]


def test_cancel_name_in_same_turn_cancels_at_once():
    """'Cancel ... on <time>, I'm Asha' needs no extra round trip."""
    ag, slot = _booked_agent()
    ag.handle("I want to cancel my appointment")
    reply = ag.handle(f"Cancel my appointment on {slot}, I'm Asha")
    assert ag.outcome == "cancelled"
    assert "Cancelled" in reply
    assert slot in booking.available_slots(limit=100)


def test_booking_turn_while_waiting_to_cancel_does_not_cancel():
    """While the agent waits for a time to cancel, a booking turn
    ("book <slot>") must be handled as a booking — not as a cancel
    confirmation for that slot."""
    ag, slot = _booked_agent()
    ag.handle("I want to cancel my appointment")
    reply = ag.handle(f"I'd like to book an appointment on {slot}")
    assert "Cancelled" not in reply
    assert "already booked" in reply
    assert [a for a in booking.list_appointments() if a["slot"] == slot and a["status"] == "booked"]


def test_extract_name_variants():
    assert va.extract_name("Rahul") == "Rahul"
    assert va.extract_name("My name is Rahul") == "Rahul"
    assert va.extract_name("This is Rahul") == "Rahul"
    assert va.extract_name("I'm Rahul") == "Rahul"
    assert va.extract_name("Call me Rahul") == "Rahul"
    # Not names: a request, a question, an emergency ("I am in terrible
    # pain" matches the "I am ..." shape but must never be a name).
    assert va.extract_name("I'd like to book an appointment") is None
    assert va.extract_name("What time do you open?") is None
    assert va.extract_name("I am in terrible pain") is None
    assert va.extract_name("2026-11-23 10:00") is None
    assert va.extract_name("") is None


def test_name_introduction_books_when_agent_asks_for_a_name():
    """'My name is Rahul' after the agent asks for a name books the
    appointment; the old code only accepted a bare name and the
    introduction fell through to the RAG fallback."""
    booking.seed_slots()
    slots = booking.available_slots(limit=5)
    ag = va.VoiceAgent(caller="+91 90000 00002")
    ag.greet()
    ag.handle(f"I'd like to book a general checkup on {slots[0]}")
    reply = ag.handle("My name is Rahul")
    assert ag.outcome == "booked"
    assert "Booked" in reply
    assert [a for a in booking.list_appointments() if a["patient_name"] == "Rahul"]


def test_available_slots_seeds_a_fresh_database():
    """The CLI `main slots` on a fresh database used to print nothing:
    seeding only happened at API import / agent creation. Offering
    slots must not depend on either."""
    assert booking.available_slots(limit=5)


def test_analytics_calls_today_is_real_not_hardcoded():
    """GET /analytics used to report answer_rate 1.0 whenever any call
    existed — a constant, not a measurement. It now reports
    calls_today, counted from the real call log in clinic time."""
    from fastapi.testclient import TestClient

    from backend.app.api import app

    client = TestClient(app)
    body = client.get("/analytics").json()
    assert "answer_rate" not in body
    assert body["calls_today"] == 0
    ag = va.VoiceAgent(caller="+91 90000 00003")
    ag.greet()
    ag.handle("What are your opening hours?")
    ag.end_call()
    assert client.get("/analytics").json()["calls_today"] == 1
