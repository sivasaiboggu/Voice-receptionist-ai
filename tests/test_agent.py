"""Tests: booking logic, RAG answers, escalation, demo call."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from backend.app import agent as va
from backend.app import booking, rag
from backend.app.db import init_db

TEST_DB = "/tmp/test_receptionist.db"


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)
    # Point booking/agent at the test DB by patching db path
    import backend.app.db as dbmod

    monkeypatch.setattr(dbmod, "DB_PATH", TEST_DB)
    yield


def test_rag_answers_price_from_kb():
    r = rag.answer("How much does teeth cleaning cost?")
    assert r["in_kb"] is True
    assert "1,500" in r["answer"]
    assert r["sources"]


def test_rag_unknown_is_honest():
    r = rag.answer("Do you do brain surgery?")
    assert r["in_kb"] is False
    assert "don't have" in r["answer"]


def test_intent_classification():
    assert va.classify_intent("I want to book an appointment") == "book"
    assert va.classify_intent("I am in terrible pain") == "emergency"
    assert va.classify_intent("Can I speak to a human?") == "human"
    assert va.classify_intent("What time do you open?") == "hours"


def test_double_booking_prevented():
    booking.seed_slots()
    slots = booking.available_slots(limit=2)
    assert slots
    ok, _ = booking.book("Asha", "+91 90000 00001", "General checkup", slots[0])
    assert ok is True
    ok2, msg2 = booking.book("Ravi", "+91 90000 00002", "General checkup", slots[0])
    assert ok2 is False
    assert "already booked" in msg2


def test_unknown_service_rejected():
    booking.seed_slots()
    slots = booking.available_slots(limit=1)
    ok, _ = booking.book("Asha", "+91 90000 00001", "Brain surgery", slots[0])
    assert ok is False


def test_emergency_escalates():
    ag = va.VoiceAgent(caller="+91 90000 00003")
    ag.greet()
    ag.handle("I am in terrible pain and bleeding")
    assert ag.escalated is True
    assert ag.outcome == "escalated-emergency"
    result = ag.end_call()
    assert result["urgency"] == "high"


def test_demo_call_books_and_logs():
    result = va.run_demo_call()
    assert result["outcome"] == "booked"
    assert "Teeth cleaning" in result["transcript"] or result["follow_up_sms"]
    assert result["summary"]
