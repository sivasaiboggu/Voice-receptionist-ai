"""FastAPI backend: chat/call simulation, bookings, calls, dashboard data."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import FastAPI, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.app import agent as voice_agent
from backend.app import booking
from backend.app.db import db, init_db
from backend.app.voice.twilio_voice import send_sms, twiml_gather, twiml_say

app = FastAPI(title="Voice Receptionist Agent")


def _env_flag(name, default=True):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _cors_origins():
    """Allowed browser origins for the dashboard.

    Set CORS_ORIGINS (comma-separated) in production to the deployed
    frontend origin, e.g. https://voice-receptionist.vercel.app.
    Defaults are the local Vite dev servers only — without this, a
    Vercel-hosted dashboard calling this API from another origin is
    blocked by the browser even though curl works.
    """
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:5174",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
init_db()
booking.seed_slots()

_sessions = {}
_MAX_SESSIONS = 100


def _get_session(caller):
    ag = _sessions.get(caller)
    if ag is None:
        ag = voice_agent.VoiceAgent(caller=caller)
        if len(_sessions) >= _MAX_SESSIONS:
            _sessions.pop(next(iter(_sessions)))  # evict the oldest session
        _sessions[caller] = ag
    return ag


class Turn(BaseModel):
    caller: str = "+919573719115"
    text: str = Field(default="", max_length=2000)


class BookRequest(BaseModel):
    patient_name: str = Field(min_length=1, max_length=100)
    phone: str = "+919573719115"
    service: str = Field(min_length=1, max_length=100)
    slot: str = Field(min_length=1, max_length=20)


class CancelRequest(BaseModel):
    slot: str = Field(min_length=1, max_length=20)
    patient_name: str | None = Field(default=None, max_length=100)
    phone: str = "+919573719115"


class DemoRequest(BaseModel):
    caller: str = "+919573719115"
    turns: list[str] | None = Field(default=None, max_length=20)


class SmsRequest(BaseModel):
    to: str = Field(min_length=7, max_length=20)
    body: str = Field(min_length=1, max_length=1000)


@app.get("/health")
def health():
    # demo_mode is read per-request (not at import) so tests and
    # redeploys can flip DEMO_MODE without restarting the process.
    # The DB check makes this a real health check: "ok" must mean the
    # API can actually serve dashboard data, not just that it booted.
    try:
        with db() as conn:
            conn.execute("SELECT 1").fetchone()
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {
        "ok": db_status == "ok",
        "service": "voice-receptionist-agent",
        "version": "0.3.3",
        "demo_mode": _env_flag("DEMO_MODE", True),
        "database": db_status,
        # Clinic timezone slot times are shown in, e.g. "Asia/Kolkata".
        "timezone": booking.clinic_tz_name(),
    }


@app.post("/call/start")
def call_start(caller: str = "+919573719115"):
    ag = voice_agent.VoiceAgent(caller=caller)
    if len(_sessions) >= _MAX_SESSIONS:
        _sessions.pop(next(iter(_sessions)))
    _sessions[caller] = ag
    return {"reply": ag.greet()}


@app.post("/call/turn")
def call_turn(turn: Turn):
    ag = _get_session(turn.caller)
    return {"reply": ag.handle(turn.text), "intent": ag.intent, "state": ag.state}


@app.post("/call/book")
def call_book(req: BookRequest):
    ag = _get_session(req.phone)
    ok, msg = ag.book(req.patient_name.strip(), req.service, req.slot.strip())
    return {"ok": ok, "message": msg, "follow_up_sms": getattr(ag, "follow_up_sms", None)}


@app.post("/call/cancel")
def call_cancel(req: CancelRequest):
    ag = _sessions.get(req.phone)
    if ag is not None:
        ok, msg = ag.cancel_booking(req.slot.strip(), patient_name=req.patient_name)
    else:
        ok, msg = booking.cancel(req.slot.strip(), patient_name=req.patient_name)
    return {"ok": ok, "message": msg}


@app.post("/call/end")
def call_end(caller: str = "+919573719115"):
    ag = _sessions.pop(caller, None)
    if not ag:
        return {"ok": False, "message": "No active call for this caller."}
    return {"ok": True, **ag.end_call()}


@app.post("/call/demo")
def call_demo(req: DemoRequest | None = None):
    """Full simulated call end-to-end, no keys needed.

    Accepts optional custom turns, e.g. {"turns": ["I am in terrible pain"]}
    to demo an escalation instead of the default booking flow.
    """
    caller = req.caller if req else "+919573719115"
    turns = req.turns if req and req.turns else None
    return voice_agent.run_demo_call(caller=caller, turns=turns)


@app.get("/appointments")
def appointments():
    return booking.list_appointments()


@app.get("/slots")
def slots(limit: int = Query(default=20, ge=1, le=100)):
    # `timezone` names the zone the slot strings are in, so a dashboard
    # in another timezone can label them instead of guessing.
    return {"available": booking.available_slots(limit=limit), "timezone": booking.clinic_tz_name()}


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
    # Twilio expects XML, not the JSON FastAPI returns for plain strings.
    ag = voice_agent.VoiceAgent()
    return Response(content=twiml_gather(ag.greet()), media_type="application/xml")


@app.post("/voice/gather")
def voice_gather(SpeechResult: str = Form(""), From: str = Form("+919573719115")):
    # Twilio posts urlencoded FORM data, not query params or JSON: the
    # plain `SpeechResult: str = ""` signature used to read it from the
    # query string, so every Twilio turn arrived as "" and the agent
    # answered "Hello" to every caller line. Form(...) reads the real body.
    ag = _get_session(From)
    reply = ag.handle(SpeechResult or "Hello")
    return Response(content=twiml_say(reply), media_type="application/xml")


@app.post("/notify/sms")
def notify_sms(req: SmsRequest):
    # Demo mode returns a draft record; nothing is sent without Twilio keys.
    return send_sms(req.to, req.body)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
