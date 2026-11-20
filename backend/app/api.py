"""FastAPI backend: chat/call simulation, bookings, calls, dashboard data."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import FastAPI
from pydantic import BaseModel

from backend.app import agent as voice_agent
from backend.app import booking
from backend.app.db import db, init_db
from backend.app.voice.twilio_voice import send_sms, twiml_gather, twiml_say

app = FastAPI(title="Voice Receptionist Agent")
init_db()
booking.seed_slots()

_sessions = {}


class Turn(BaseModel):
    caller: str = "+919573719115"
    text: str


class BookRequest(BaseModel):
    patient_name: str
    phone: str = "+919573719115"
    service: str
    slot: str


@app.get("/health")
def health():
    return {"ok": True, "service": "voice-receptionist-agent", "demo_mode": True}


@app.post("/call/start")
def call_start(caller: str = "+919573719115"):
    ag = voice_agent.VoiceAgent(caller=caller)
    _sessions[caller] = ag
    return {"reply": ag.greet()}


@app.post("/call/turn")
def call_turn(turn: Turn):
    ag = _sessions.get(turn.caller) or voice_agent.VoiceAgent(caller=turn.caller)
    _sessions[turn.caller] = ag
    return {"reply": ag.handle(turn.text), "intent": ag.intent, "state": ag.state}


@app.post("/call/book")
def call_book(req: BookRequest):
    ag = _sessions.get(req.phone) or voice_agent.VoiceAgent(caller=req.phone)
    ok, msg = ag.book(req.patient_name, req.service, req.slot)
    return {"ok": ok, "message": msg, "follow_up_sms": getattr(ag, "follow_up_sms", None)}


@app.post("/call/end")
def call_end(caller: str = "+919573719115"):
    ag = _sessions.pop(caller, None)
    if not ag:
        return {"ok": False, "message": "No active call for this caller."}
    return {"ok": True, **ag.end_call()}


@app.post("/call/demo")
def call_demo():
    """Full simulated call end-to-end, no keys needed."""
    return voice_agent.run_demo_call()


@app.get("/appointments")
def appointments():
    return booking.list_appointments()


@app.get("/slots")
def slots(limit: int = 20):
    return {"available": booking.available_slots(limit=limit)}


@app.get("/calls")
def calls():
    with db() as conn:
        rows = conn.execute("SELECT * FROM calls ORDER BY id DESC LIMIT 50").fetchall()
    return [dict(r) for r in rows]


@app.get("/messages")
def messages():
    with db() as conn:
        rows = conn.execute("SELECT * FROM messages ORDER BY id DESC LIMIT 50").fetchall()
    return [dict(r) for r in rows]


@app.get("/analytics")
def analytics():
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM calls").fetchone()["c"]
        booked = conn.execute("SELECT COUNT(*) c FROM appointments WHERE status='booked'").fetchone()["c"]
        esc = conn.execute("SELECT COUNT(*) c FROM calls WHERE escalated=1").fetchone()["c"]
        msgs = conn.execute("SELECT COUNT(*) c FROM messages WHERE handled=0").fetchone()["c"]
    return {
        "calls_answered": total,
        "appointments_booked": booked,
        "escalations": esc,
        "unhandled_messages": msgs,
        "answer_rate": 1.0 if total else 0.0,
    }


@app.post("/voice/incoming")
def voice_incoming():
    ag = voice_agent.VoiceAgent()
    return twiml_gather(ag.greet())


@app.post("/voice/gather")
def voice_gather(SpeechResult: str = "", From: str = "+919573719115"):
    ag = _sessions.get(From) or voice_agent.VoiceAgent(caller=From)
    _sessions[From] = ag
    reply = ag.handle(SpeechResult or "Hello")
    return twiml_say(reply)


@app.post("/notify/sms")
def notify_sms(to: str, body: str):
    return send_sms(to, body)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
