"""Voice agent core — LangGraph-style state machine.

Flow: greet → understand intent → RAG / booking / message / escalate
→ confirm → log call (transcript + summary + sentiment + urgency).

Free by design: STT/TTS are mock in demo mode (real Twilio + Gemini
wiring is in voice/twilio_voice.py, optional, keys via .env).
The state machine itself is dependency-light so tests run anywhere.
"""
import os
import re

from . import booking, rag
from .db import db, init_db

BUSINESS = os.environ.get("BUSINESS_NAME", "Sunrise Dental Clinic")

# Word-boundary keyword sets. Substring matching used to misfire badly
# ("visited" counted as a booking, "when" as an hours question, "agent"
# in "voice agent" as a human request), so every keyword is matched as a
# whole word or phrase. Priority order is deliberate: an emergency always
# wins, a cancellation beats a booking ("cancel my appointment" contains
# "appointment"), and a human request beats a FAQ.
INTENTS = {
    "book": ["book", "booking", "appointment", "schedule", "checkup", "check-up",
             "cleaning", "visit", "see a dentist", "see the dentist"],
    "hours": ["open", "hours", "timing", "timings", "close", "closed", "closing"],
    "price": ["price", "prices", "cost", "costs", "fee", "fees", "charge",
              "charges", "how much"],
    "services": ["service", "services", "treatment", "treatments", "offer",
                 "offers", "provide", "what do you do"],
    "emergency": ["pain", "emergency", "urgent", "bleeding", "swelling",
                  "accident", "broken tooth", "hurt", "hurts", "aching"],
    "human": ["human", "person", "agent", "manager", "real person", "someone",
              "representative", "staff"],
    "cancel": ["cancel", "cancelled", "cancellation", "reschedule", "postpone",
               "change my appointment", "move my appointment"],
    "message": ["message", "call me back", "callback", "leave a message",
                "take a message"],
}

SLOT_RE = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}")
NAME_RE = re.compile(r"[A-Za-z][A-Za-z .'\-]{1,60}")


def _has_keyword(text, keyword):
    return re.search(r"\b" + re.escape(keyword) + r"\b", text) is not None


def _service_variants(name):
    """Name forms a caller might use: the full name, plus the distinctive
    short form ('root canal' for 'Root canal treatment', 'braces' for
    'Braces consultation')."""
    yield name
    words = name.split()
    if len(words) > 2:
        yield " ".join(words[:2])
    if words[0].lower() in ("braces",):
        yield words[0]


def _mentions_service(text):
    """True when the caller names a service we offer ('root canal', ...)."""
    return any(
        _has_keyword(text, variant.lower())
        for name in booking.SERVICES
        for variant in _service_variants(name)
    )


def classify_intent(text):
    """Classify one caller turn. Never raises on odd input."""
    if not text or not str(text).strip():
        return "unknown"
    t = str(text).lower()
    if any(_has_keyword(t, w) for w in INTENTS["emergency"]):
        return "emergency"
    if any(_has_keyword(t, w) for w in INTENTS["cancel"]):
        return "cancel"
    if any(_has_keyword(t, w) for w in INTENTS["human"]):
        return "human"
    if any(_has_keyword(t, w) for w in INTENTS["book"]):
        return "book"
    # "What time do you do root canal?" is a services question, not hours.
    if any(_has_keyword(t, w) for w in INTENTS["hours"]) and not _mentions_service(t):
        return "hours"
    if any(_has_keyword(t, w) for w in INTENTS["price"]):
        return "price"
    if any(_has_keyword(t, w) for w in INTENTS["services"]) or _mentions_service(t):
        return "services"
    if any(_has_keyword(t, w) for w in INTENTS["message"]):
        return "message"
    return "faq"


def detect_sentiment(text):
    t = str(text).lower()
    if any(_has_keyword(t, w) for w in ["angry", "furious", "terrible", "worst", "pain", "bleeding"]):
        return "negative"
    if any(_has_keyword(t, w) for w in ["thank", "thanks", "great", "happy", "excellent", "wonderful"]):
        return "positive"
    return "neutral"


def detect_urgency(text, intent):
    if intent == "emergency":
        return "high"
    if any(_has_keyword(str(text).lower(), w) for w in ["today", "asap", "urgent", "now"]):
        return "medium"
    return "low"


def summarise(transcript):
    """One-line summary from the transcript (extractive, no LLM needed)."""
    lines = [l for l in transcript.splitlines() if l.strip()]
    intent_line = next((l for l in lines if "Caller:" in l), "")
    return intent_line.replace("Caller:", "Caller asked:").strip() or "Call handled by the agent."


def extract_slot(text):
    """Pull a 'YYYY-MM-DD HH:MM' slot out of free text, if present."""
    m = SLOT_RE.search(str(text or ""))
    return m.group(0) if m else None


def extract_service(text):
    """Pull a service name we offer out of free text, if present."""
    t = str(text or "")
    for name in booking.SERVICES:
        for variant in _service_variants(name):
            if _has_keyword(t.lower(), variant.lower()):
                return name
    return None


class VoiceAgent:
    """One call = one agent instance, with a transcript and a state."""

    def __init__(self, caller="+91 00000 00000"):
        self.caller = caller
        self.transcript = []
        self.state = "greet"
        self.intent = None
        self.escalated = False
        self.outcome = None
        self.pending = None  # (service, slot) awaiting the caller's name
        self.pending_slot = None  # a slot the caller named before naming a service
        self.follow_up_sms = None
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
        text = "" if caller_text is None else str(caller_text)
        self.say("Caller", text)
        if not text.strip():
            self.intent = "unknown"
            return self.say(
                "Agent",
                "Sorry, I didn't quite catch that — could you say it again? "
                "I can book an appointment, answer questions, or connect you to a person.",
            )

        # Multi-turn continuations, checked before fresh intent classification:
        # the caller is answering our follow-up question, not starting over.
        slot = extract_slot(text)
        if self.state == "cancel" and slot:
            self.intent = "cancel"
            return self._do_cancel(slot)
        if self.state == "message":
            self.intent = "message"
            return self.take_message(text)
        if self.pending and NAME_RE.fullmatch(text.strip()) and classify_intent(text) == "faq":
            self.intent = "book"
            service, pending_slot = self.pending
            self.pending = None
            _ok, msg = self.book(text.strip(), service, pending_slot)
            return msg  # book() already added the reply to the transcript
        if self.pending_slot:
            # The caller named a time last turn and is now naming the
            # service ("Teeth cleaning") or giving their name first.
            # Without this the slot was forgotten: a service reply fell
            # through to offering the next five slots, and a bare name
            # fell through to the RAG "I don't have that" fallback.
            service = extract_service(text)
            if service and not slot:
                self.pending = (service, self.pending_slot)
                self.pending_slot = None
                self.intent = "book"
                self.state = "book"
                return self.say(
                    "Agent",
                    f"{service} on {self.pending[1]} is available — may I have your name to confirm the booking?",
                )
            if NAME_RE.fullmatch(text.strip()) and classify_intent(text) == "faq":
                self.intent = "book"
                return self.say(
                    "Agent",
                    f"Thanks — and which service would you like on {self.pending_slot}?",
                )
            if slot and slot != self.pending_slot:
                self.pending_slot = None  # a different time: start over below
            elif classify_intent(text) != "book":
                self.pending_slot = None  # caller moved on to something else

        self.intent = classify_intent(text)

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
            reply = self._handle_book(text)
        elif self.intent == "cancel":
            self.state = "cancel"
            if slot:
                reply = self._do_cancel(slot)
            else:
                reply = self.say("Agent", "No problem — could you tell me the date and time of the appointment to cancel? For example, 2026-11-21 10:00.")
        elif self.intent == "message":
            self.state = "message"
            reply = self.say("Agent", "Of course — please tell me your message and the clinic will call you back today.")
        elif self.intent in ("hours", "price", "services", "faq"):
            result = rag.answer(text)
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

        return reply

    def _handle_book(self, text):
        """Booking turn: a caller naming a time/service gets that slot checked;
        otherwise the next free times are offered. Never promises a slot
        that does not exist — and never offers an empty list: when nothing
        is free the reply says so instead of 'our next available times
        are: . Which one works for you?'"""
        self.state = "book"
        slot = extract_slot(text)
        service = extract_service(text)
        if slot:
            slot_dt = booking.parse_slot(slot)
            if slot_dt is not None and slot_dt < booking.now_clinic():
                return self._offer_alternatives(
                    f"That time ({slot}) is in the past — our next available times are: "
                )
            with db() as conn:
                row = conn.execute("SELECT available FROM slots WHERE slot=?", (slot,)).fetchone()
            if row is None:
                return self._offer_alternatives(
                    f"That time ({slot}) is outside our opening hours — our next available times are: "
                )
            if row["available"] == 0:
                return self._offer_alternatives(
                    f"Sorry, {slot} is already booked. Our next available times are: "
                )
            if service:
                # The slot is free, but the service may not fit in it
                # (a 60-minute root canal at 19:30 runs past closing) or
                # may overlap a booking in the next slot.
                _, _, error = booking.validate_booking(
                    "Patient", self.caller, service, slot
                )
                conflict = booking.slot_conflict(slot, service) if not error else None
                if error or conflict:
                    return self._offer_alternatives(
                        (error or conflict) + " Our next available times are: "
                    )
                self.pending = (service, slot)
                return self.say(
                    "Agent",
                    f"{service} on {slot} is available — may I have your name to confirm the booking?",
                )
            self.pending_slot = slot
            return self.say(
                "Agent",
                f"{slot} is available — which service would you like, and may I have your name?",
            )
        slots = booking.available_slots(limit=5)
        if not slots:
            self.outcome = "answered"
            return self.say(
                "Agent",
                "I'm sorry — we have no free appointments in the next week. "
                "Would you like me to take a message so the clinic can call you back?",
            )
        return self.say(
            "Agent",
            "I'd be happy to book that. Our next available times are: "
            + ", ".join(slots)
            + ". Which time works for you, and may I have your name?",
        )

    def _offer_alternatives(self, prefix):
        """Reply with `prefix` + the next free times, or an honest
        no-availability message when the list is empty."""
        slots = booking.available_slots(limit=5)
        if not slots:
            self.outcome = "answered"
            return self.say(
                "Agent",
                "I'm sorry — we have no free appointments in the next week. "
                "Would you like me to take a message so the clinic can call you back?",
            )
        return self.say("Agent", prefix + ", ".join(slots) + ". Which one works for you?")

    def _do_cancel(self, slot):
        ok, msg = booking.cancel(slot)
        self.state = "confirm"
        self.outcome = "cancelled" if ok else "answered"
        return self.say("Agent", msg + (" Is there anything else I can help with?" if ok else " Could you check the date and time and try again?"))

    def cancel_booking(self, slot, patient_name=None):
        """Cancel by slot (optionally name-checked). Returns (ok, message)."""
        ok, msg = booking.cancel(slot, patient_name=patient_name)
        if ok:
            self.outcome = "cancelled"
            self.state = "confirm"
        return ok, msg

    def book(self, patient_name, service, slot):
        ok, msg = booking.book(patient_name, self.caller, service, slot)
        if ok:
            self.outcome = "booked"
            self.state = "confirm"
            # Draft follow-up SMS (free test path: WhatsApp/Twilio sandbox)
            self.follow_up_sms = (
                f"Hi {patient_name}, your {service} at {BUSINESS} is confirmed for {slot}. "
                "Reply YES to confirm or call us to reschedule."
            )
        else:
            # Never leave a stale confirmation draft from an earlier booking.
            self.follow_up_sms = None
            self.state = "book"
        self.say("Agent", msg)
        return ok, msg

    def take_message(self, message):
        text = "" if message is None else str(message).strip()
        if not text:
            return self.say("Agent", "Sorry, I didn't catch your message — could you repeat it?")
        if len(text) > 1000:
            return self.say("Agent", "That message is a bit long for me to take down — could you give me a shorter version?")
        with db() as conn:
            conn.execute(
                "INSERT INTO messages (caller, message, created_at) VALUES (?,?,?)",
                (self.caller, text, booking.now_utc().isoformat()),
            )
        self.outcome = "message-taken"
        self.state = "confirm"
        return self.say("Agent", "Thank you — I've taken your message and the clinic will call you back today.")

    def _call_signals(self):
        """Sentiment and urgency for the whole call, from every caller line.

        The old code logged only the LAST turn's signals: a caller who
        shouted in pain and then said "thanks" was logged as positive /
        low urgency, and an escalation decided on an early turn vanished
        from the record. Negative beats positive, high beats medium.
        """
        sentiment = "neutral"
        urgency = "low"
        for line in self.transcript:
            if not line.startswith("Caller:"):
                continue
            text = line[len("Caller:"):].strip()
            if detect_sentiment(text) == "negative":
                sentiment = "negative"
            elif detect_sentiment(text) == "positive" and sentiment != "negative":
                sentiment = "positive"
            intent = classify_intent(text)
            if intent == "emergency":
                urgency = "high"
            elif detect_urgency(text, intent) == "medium" and urgency != "high":
                urgency = "medium"
        return sentiment, urgency

    def end_call(self):
        transcript = "\n".join(self.transcript)
        summary = summarise(transcript)
        sentiment, urgency = self._call_signals()
        with db() as conn:
            conn.execute(
                """INSERT INTO calls (caller, started_at, transcript, summary,
                   sentiment, urgency, outcome, escalated)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    self.caller, booking.now_utc().isoformat(), transcript, summary,
                    sentiment, urgency,
                    self.outcome or "answered", 1 if self.escalated else 0,
                ),
            )
        return {
            "caller": self.caller,
            "outcome": self.outcome,
            "escalated": self.escalated,
            "sentiment": sentiment,
            "urgency": urgency,
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
    # Book the first available slot as part of the demo — unless the call
    # escalated (an emergency/human handoff must never auto-book). The
    # slot must fit the service: the first free slot overall can be
    # 19:30, which a 45-minute cleaning would run past closing.
    slots = booking.available_slots(service="Teeth cleaning", limit=1)
    if slots and not agent.escalated:
        ok, msg = agent.book("Demo Patient", "Teeth cleaning", slots[0])
        out.append(msg)
    result = agent.end_call()
    result["replies"] = out
    return result
