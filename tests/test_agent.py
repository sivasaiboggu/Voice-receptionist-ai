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
    # A price question that names a service is a price question, not a
    # booking: "cleaning" is a booking keyword, so the old order
    # classified "How much does cleaning cost?" as book and answered
    # with a list of slots instead of the price.
    assert va.classify_intent("How much does cleaning cost?") == "price"
    assert va.classify_intent("What does a checkup cost?") == "price"
    assert va.classify_intent("How much is a root canal?") == "price"
    # ...and a booking request with no price words still books.
    assert va.classify_intent("I'd like to book a teeth cleaning") == "book"


def test_demo_call_price_turn_is_answered_from_kb():
    """The demo call's own price turn ("How much does cleaning cost?")
    used to come back as a booking offer. It must be answered from the
    knowledge base, with the price and a citation."""
    result = va.run_demo_call()
    price_reply = [r for r in result["replies"] if "1,500" in r]
    assert price_reply, result["replies"]
    assert "pricing.md" in price_reply[0]
    assert result["outcome"] == "booked"


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


# --- Booking edge cases ---

def test_past_slot_rejected():
    booking.seed_slots()
    ok, msg = booking.book("Asha", "+91 90000 00001", "General checkup", "2020-01-01 10:00")
    assert ok is False
    assert "past" in msg


def test_malformed_slot_rejected():
    booking.seed_slots()
    for bad in ("tomorrow 10am", "2026-13-40 99:99", "2026-11-21 10:15", ""):
        ok, _ = booking.book("Asha", "+91 90000 00001", "General checkup", bad)
        assert ok is False, bad


def test_invalid_name_and_phone_rejected():
    booking.seed_slots()
    slots = booking.available_slots(limit=1)
    assert slots
    ok, _ = booking.book("", "+91 90000 00001", "General checkup", slots[0])
    assert ok is False
    ok, _ = booking.book("Asha", "not-a-phone", "General checkup", slots[0])
    assert ok is False


def test_service_name_case_insensitive():
    booking.seed_slots()
    # The slot must fit the service: the first free slot overall can be
    # 19:30, which a 45-minute cleaning would run past closing.
    slots = booking.available_slots("teeth cleaning", limit=1)
    ok, msg = booking.book("Asha", "+91 90000 00001", "teeth cleaning", slots[0])
    assert ok is True
    assert "Teeth cleaning" in msg


def test_available_slots_exclude_past():
    booking.seed_slots()
    with __import__("backend.app.db", fromlist=["db"]).db() as conn:
        conn.execute("INSERT OR IGNORE INTO slots (slot, available) VALUES ('2020-01-01 10:00', 1)")
    assert "2020-01-01 10:00" not in booking.available_slots(limit=100)
    assert all(s > "2020-01-01 10:00" for s in booking.available_slots(limit=100))


def test_cancel_frees_slot_for_rebooking():
    booking.seed_slots()
    slots = booking.available_slots(limit=1)
    ok, _ = booking.book("Asha", "+91 90000 00001", "General checkup", slots[0])
    assert ok is True
    ok, _ = booking.cancel(slots[0])
    assert ok is True
    assert slots[0] in booking.available_slots(limit=100)
    ok, _ = booking.book("Ravi", "+91 90000 00002", "General checkup", slots[0])
    assert ok is True


def test_cancel_unknown_slot_fails():
    ok, msg = booking.cancel("2026-11-21 10:00")
    assert ok is False
    assert "No booked appointment" in msg


def test_cancel_with_wrong_name_fails():
    booking.seed_slots()
    slots = booking.available_slots(limit=1)
    booking.book("Asha", "+91 90000 00001", "General checkup", slots[0])
    ok, _ = booking.cancel(slots[0], patient_name="Ravi")
    assert ok is False
    ok, _ = booking.cancel(slots[0], patient_name="Asha")
    assert ok is True


# --- Intent classification ---

def test_intent_word_boundaries():
    assert va.classify_intent("I visited yesterday and it was great") != "book"
    assert va.classify_intent("When do you do root canal?") == "services"
    assert va.classify_intent("Please cancel my appointment") == "cancel"
    assert va.classify_intent("What time do you open?") == "hours"
    assert va.classify_intent("How much is a root canal?") == "price"
    assert va.classify_intent("") == "unknown"
    assert va.classify_intent("I need a human being, please") == "human"


# --- RAG quality ---

def test_rag_hours_not_returned_for_treatment_question():
    r = rag.answer("When do you do root canal?")
    assert "9:00 AM to 8:00 PM" not in r["answer"]
    assert "6,000" in r["answer"]


def test_rag_accepts_inflected_words():
    r = rag.answer("Do you accept insurance?")
    assert r["in_kb"] is True
    assert "insurance" in r["answer"].lower() or "insurer" in r["answer"].lower()


# --- Agent multi-turn flows ---

def test_agent_empty_turn_asks_for_clarification():
    ag = va.VoiceAgent(caller="+91 90000 00003")
    ag.greet()
    reply = ag.handle("   ")
    assert "didn't quite catch" in reply


def test_agent_cancel_flow():
    """Cancelling by voice is name-checked: the agent asks for the
    caller's name after the time, and only cancels when it matches."""
    booking.seed_slots()
    slots = booking.available_slots(limit=1)
    booking.book("Asha", "+91 90000 00001", "General checkup", slots[0])
    ag = va.VoiceAgent(caller="+91 90000 00001")
    ag.greet()
    ag.handle("I want to cancel my appointment")
    assert ag.state == "cancel"
    reply = ag.handle(f"Yes, cancel {slots[0]}")
    assert "your name" in reply
    assert ag.outcome != "cancelled"
    ag.handle("Asha")
    assert ag.outcome == "cancelled"
    assert slots[0] in booking.available_slots(limit=100)


def test_agent_message_flow():
    ag = va.VoiceAgent(caller="+91 90000 00004")
    ag.greet()
    ag.handle("Please take a message")
    assert ag.state == "message"
    ag.handle("Call me back about my bill, please")
    assert ag.outcome == "message-taken"


def test_agent_books_named_slot_then_name():
    booking.seed_slots()
    slots = booking.available_slots("Teeth cleaning", limit=1)
    ag = va.VoiceAgent(caller="+91 90000 00005")
    ag.greet()
    reply = ag.handle(f"Book teeth cleaning on {slots[0]}")
    assert "available" in reply and "your name" in reply
    ag.handle("Asha")
    assert ag.outcome == "booked"
    assert ag.follow_up_sms and "Asha" in ag.follow_up_sms


def test_agent_failed_booking_clears_stale_sms():
    booking.seed_slots()
    slots = booking.available_slots("Teeth cleaning", limit=1)
    ag = va.VoiceAgent(caller="+91 90000 00006")
    ag.book("Asha", "Teeth cleaning", slots[0])
    assert ag.follow_up_sms
    ok, _ = ag.book("Ravi", "Teeth cleaning", slots[0])
    assert ok is False
    assert ag.follow_up_sms is None


def test_demo_escalation_does_not_book():
    result = va.run_demo_call(turns=["I am in terrible pain and bleeding"])
    assert result["outcome"] == "escalated-emergency"
    assert result["escalated"] is True
    assert result["follow_up_sms"] is None


def test_twiml_escapes_special_characters():
    import xml.etree.ElementTree as ET

    from backend.app.voice.twilio_voice import twiml_say

    xml = twiml_say("Tom & Jerry <3")
    ET.fromstring(xml)  # raises if the XML is malformed
    assert "&amp;" in xml
