"""Voice agent core — LangGraph-style state machine.

Flow: greet → understand intent → RAG / booking / message / escalate
→ confirm → log call (transcript + summary + sentiment + urgency).

Free by design: STT/TTS are mock in demo mode (real Twilio + Gemini
wiring is in voice/twilio_voice.py, optional, keys via .env).
The state machine itself is dependency-light so tests run anywhere.
"""
import os
import re
from datetime import datetime

from . import booking, rag
from .db import db, init_db

BUSINESS = os.environ.get("BUSINESS_NAME", "Sunrise Dental Clinic")

INTENTS = {
    "book": ["book", "appointment", "schedule", "visit", "checkup", "cleaning"],
    "hours": ["open", "hours", "timing", "when", "close"],
    "price": ["price", "cost", "fee", "charge", "how much"],
    "services": ["service", "treatment", "what do you", "offer"],
    "emergency": ["pain", "emergency", "urgent", "bleeding", "swelling", "accident"],
    "human": ["human", "person", "agent", "manager", "real person", "someone"],
    "cancel": ["cancel", "reschedule"],
}


def classify_intent(text):
    t = text.lower()
    if any(w in t for w in INTENTS["emergency"]):
        return "emergency"
    if any(w in t for w in INTENTS["cancel"]):
        return "cancel"
    if any(w in t for w in INTENTS["book"]):
        return "book"
    if any(w in t for w in INTENTS["human"]):
        return "human"
    if any(w in t for w in INTENTS["hours"]):
        return "hours"
    if any(w in t for w in INTENTS["price"]):
        return "price"
    if any(w in t for w in INTENTS["services"]):
        return "services"
    return "faq"


def detect_sentiment(text):
    t = text.lower()
    if any(w in t for w in ["angry", "furious", "terrible", "worst", "pain", "bleeding"]):
        return "negative"
    if any(w in t for w in ["thank", "great", "happy", "excellent", "wonderful"]):
        return "positive"
    return "neutral"


def detect_urgency(text, intent):
    if intent == "emergency":
        return "high"
    if any(w in text.lower() for w in ["today", "asap", "urgent", "now"]):
        return "medium"
    return "low"


def summarise(transcript):
    """One-line summary from the transcript (extractive, no LLM needed)."""
    lines = [l for l in transcript.splitlines() if l.strip()]
    intent_line = next((l for l in lines if "Caller:" in l), "")
    return intent_line.replace("Caller:", "Caller asked:").strip() or "Call handled by the agent."


class VoiceAgent:
    """One call = one agent instance, with a transcript and a state."""

    def __init__(self, caller="+91 00000 00000"):
        self.caller = caller
        self.transcript = []
        self.state = "greet"
        self.intent = None
        self.escalated = False
        self.outcome = None
        init_db()
        booking.seed_slots()

    def say(self, speaker, text):
        self.transcript.append(f"{speaker}: {text}")
        return text

    def greet(self):
        self.state = "understand"
        return self.say(
            "Agent",
            f"Hello, thank you for calling {BUSINESS}. "
            "I can book an appointment, answer questions about our services and prices, "
            "or connect you to a person. How can I help?",
        )

    def handle(self, caller_text):
        """One caller turn → agent reply. Returns the agent's spoken reply."""
        self.say("Caller", caller_text)
        self.intent = classify_intent(caller_text)
        sentiment = detect_sentiment(caller_text)
        urgency = detect_urgency(caller_text, self.intent)

        if self.intent == "emergency":
            self.escalated = True
            self.outcome = "escalated-emergency"
            self.state = "escalate"
            reply = self.say(
                "Agent",
                "I'm sorry to hear that — urgent cases are seen the same day. "
                "I'm connecting you to the clinic now, and I've flagged this as urgent. "
                "Please stay on the line.",
            )
        elif self.intent == "human":
            self.escalated = True
            self.outcome = "escalated-human-request"
            self.state = "escalate"
            reply = self.say("Agent", "Of course — I'll connect you to a member of our team now.")
        elif self.intent == "book":
            self.state = "book"
            slots = booking.available_slots(limit=5)
            reply = self.say(
                "Agent",
                "I'd be happy to book that. Our next available times are: "
                + ", ".join(slots)
                + ". Which time works for you, and may I have your name?",
            )
        elif self.intent == "cancel":
            self.state = "cancel"
            reply = self.say("Agent", "No problem — could you tell me the date and time of the appointment to cancel?")
        elif self.intent in ("hours", "price", "services", "faq"):
            result = rag.answer(caller_text)
            self.outcome = "answered"
            self.state = "confirm"
            suffix = f" (Source: {', '.join(result['sources'])})" if result["sources"] else ""
            reply = self.say("Agent", result["answer"] + suffix + " Is there anything else I can help with?")
        else:
            self.outcome = "answered"
            reply = self.say(
                "Agent",
                "I can help with bookings, opening hours, prices and services — "
                "or I can take a message for the clinic. What would you like?",
            )

        self._last = {"intent": self.intent, "sentiment": sentiment, "urgency": urgency}
        return reply

    def book(self, patient_name, service, slot):
        ok, msg = booking.book(patient_name, self.caller, service, slot)
        self.say("Agent", msg)
        if ok:
            self.outcome = "booked"
            self.state = "confirm"
            # Draft follow-up SMS (free test path: WhatsApp/Twilio sandbox)
            self.follow_up_sms = (
                f"Hi {patient_name}, your {service} at {BUSINESS} is confirmed for {slot}. "
                "Reply YES to confirm or call us to reschedule."
            )
        return ok, msg

    def take_message(self, message):
        with db() as conn:
            conn.execute(
                "INSERT INTO messages (caller, message, created_at) VALUES (?,?,?)",
                (self.caller, message, datetime.now().isoformat()),
            )
        self.outcome = "message-taken"
        return self.say("Agent", "Thank you — I've taken your message and the clinic will call you back today.")

    def end_call(self):
        transcript = "\n".join(self.transcript)
        summary = summarise(transcript)
        last = getattr(self, "_last", {"sentiment": "neutral", "urgency": "low"})
        with db() as conn:
            conn.execute(
                """INSERT INTO calls (caller, started_at, transcript, summary,
                   sentiment, urgency, outcome, escalated)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    self.caller, datetime.now().isoformat(), transcript, summary,
                    last["sentiment"], last["urgency"],
                    self.outcome or "answered", 1 if self.escalated else 0,
                ),
            )
        return {
            "caller": self.caller,
            "outcome": self.outcome,
            "escalated": self.escalated,
            "sentiment": last["sentiment"],
            "urgency": last["urgency"],
            "summary": summary,
            "transcript": transcript,
            "follow_up_sms": getattr(self, "follow_up_sms", None),
        }


def run_demo_call(caller="+919573719115", turns=None):
    """Run a full simulated call end-to-end, no phone keys needed."""
    turns = turns or [
        "Hi, I'd like to book a teeth cleaning appointment",
        "What are your opening hours?",
        "How much does cleaning cost?",
    ]
    agent = VoiceAgent(caller=caller)
    out = [agent.greet()]
    for t in turns:
        out.append(agent.handle(t))
    # Book the first available slot as part of the demo
    slots = booking.available_slots(limit=1)
    if slots:
        ok, msg = agent.book("Demo Patient", "Teeth cleaning", slots[0])
        out.append(msg)
    result = agent.end_call()
    result["replies"] = out
    return result
