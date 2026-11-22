"""Tests: booking continuations — the caller answering the agent's
follow-up ("Which time works for you, and may I have your name?")
with just a time or just a name.

Both used to fall through to the RAG "I don't have that information"
fallback, because a bare time and a bare name classify as faq, not
book — so a booking that was one answer away from done died on the
next turn. The agent must treat those replies as the booking
continuation they are, and must never take a state ("I am fine",
"I'm sorry") or a bare acknowledgement ("Yes") for a name.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app import agent as va
from backend.app import booking
from backend.app.db import init_db

TEST_DB = "/tmp/test_receptionist_continuation.db"


import pytest


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)
    import backend.app.db as dbmod

    monkeypatch.setattr(dbmod, "DB_PATH", TEST_DB)
    yield


def _offered_agent():
    """An agent that has offered the next slots for a teeth cleaning
    and asked for a time and a name."""
    ag = va.VoiceAgent(caller="+919999900100")
    reply = ag.handle("I'd like to book a teeth cleaning appointment")
    assert "next available times are" in reply
    assert ag.state == "book"
    return ag


def test_bare_slot_after_offer_asks_for_name_then_books():
    ag = _offered_agent()
    slot = booking.available_slots(service="Teeth cleaning", limit=1)[0]
    reply = ag.handle(slot)
    assert "is available" in reply and "your name" in reply, reply
    assert "don't have that information" not in reply
    reply = ag.handle("My name is Rahul")
    assert "Booked:" in reply and "Rahul" in reply, reply
    assert ag.outcome == "booked"


def test_name_first_after_offer_then_bare_slot_books():
    ag = _offered_agent()
    reply = ag.handle("My name is Rahul")
    assert "Thanks, Rahul" in reply, reply
    assert "don't have that information" not in reply
    slot = booking.available_slots(service="Teeth cleaning", limit=1)[0]
    reply = ag.handle(slot)
    assert "Booked:" in reply and "Rahul" in reply, reply
    assert ag.outcome == "booked"


@pytest.mark.parametrize(
    "intro", ["My name is Rahul", "This is Rahul", "I'm Rahul", "Call me Rahul"]
)
def test_every_name_pattern_books_after_offer(intro):
    ag = _offered_agent()
    reply = ag.handle(intro)
    assert "Thanks, Rahul" in reply, (intro, reply)
    slot = booking.available_slots(service="Teeth cleaning", limit=1)[0]
    reply = ag.handle(slot)
    assert "Booked:" in reply, (intro, reply)


def test_slot_and_name_in_one_turn_books_at_once():
    ag = _offered_agent()
    slot = booking.available_slots(service="Teeth cleaning", limit=1)[0]
    reply = ag.handle(f"{slot}, I'm Rahul")
    assert "Booked:" in reply and "Rahul" in reply, reply
    assert ag.outcome == "booked"


def test_name_given_with_slot_first_is_remembered_for_service():
    """Slot first, then name, then service: the name must not be asked
    for a second time."""
    ag = va.VoiceAgent(caller="+919999900101")
    slot = booking.available_slots(service="Teeth cleaning", limit=1)[0]
    reply = ag.handle(f"Is {slot} free?")
    assert "which service" in reply, reply
    reply = ag.handle("My name is Asha")
    assert "Thanks, Asha" in reply, reply
    reply = ag.handle("Teeth cleaning")
    assert "Booked:" in reply and "Asha" in reply, reply


def test_pain_after_offer_escalates_and_is_not_a_name():
    ag = _offered_agent()
    reply = ag.handle("I am in terrible pain")
    assert ag.escalated and ag.outcome == "escalated-emergency", reply
    assert ag.pending_name is None


def test_bare_acknowledgement_is_not_a_name():
    assert va.extract_name("Yes") is None
    assert va.extract_name("OK") is None
    assert va.extract_name("Sure") is None
    ag = _offered_agent()
    ag.handle("Yes")
    assert ag.pending_name is None


def test_state_after_i_am_is_not_a_name():
    assert va.extract_name("I am fine") is None
    assert va.extract_name("I'm sorry") is None
    assert va.extract_name("I am sick") is None
    assert va.extract_name("My name is Rahul") == "Rahul"


def test_name_is_not_reused_after_the_caller_moves_on():
    """A name remembered for one booking must not silently book a
    later one after the caller asked about prices in between."""
    ag = _offered_agent()
    ag.handle("My name is Rahul")
    assert ag.pending_name == "Rahul"
    reply = ag.handle("How much does cleaning cost?")
    assert "Rs 1,500" in reply
    assert ag.pending_name is None
    slot = booking.available_slots(service="Teeth cleaning", limit=1)[0]
    reply = ag.handle(f"Book teeth cleaning on {slot}")
    assert "your name" in reply, reply  # asked again, not auto-booked
    assert "Booked:" not in reply


def test_handoff_interrupts_pending_message():
    ag = va.VoiceAgent(caller="+12025550106")
    ag.handle("Can I leave a message?")
    assert ag.state == "message"
    reply = ag.handle("I am in terrible pain")
    assert ag.state == "escalate" and ag.outcome == "escalated-emergency", reply


def test_unavailable_pending_slot_recovers_through_conversation():
    ag = _offered_agent()
    slot = ag.offered_slots[0]
    ag.handle(slot)
    assert booking.book("Competing Patient", "+12025550109", "Teeth cleaning", slot)[0]
    reply = ag.handle("My name is Rahul")
    assert ag.state == "book" and ag.offered_slots and slot not in ag.offered_slots, reply
    reply = ag.handle(ag.offered_slots[0])
    assert "Booked:" in reply and "Rahul" in reply


def test_handoff_with_a_time_interrupts_pending_booking():
    ag = _offered_agent()
    slot = ag.offered_slots[0]
    reply = ag.handle(f"I am in terrible pain, can I come in at {slot}?")
    assert ag.state == "escalate" and ag.outcome == "escalated-emergency", reply
    assert ag.offered_slots == []
