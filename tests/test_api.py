"""API tests: validation, TwiML content type, cancel + demo endpoints.

Uses FastAPI's TestClient against a scratch SQLite file (the app reads
the DB path dynamically, so the fixture redirect applies to requests).
No real calls or SMS are made — /notify/sms stays in demo mode.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from backend.app.db import init_db

TEST_DB = "/tmp/test_receptionist_api.db"


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    init_db(TEST_DB)
    import backend.app.db as dbmod

    monkeypatch.setattr(dbmod, "DB_PATH", TEST_DB)
    from backend.app import booking

    booking.seed_slots()
    yield


@pytest.fixture()
def client():
    from backend.app.api import app

    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_health_reports_demo_mode_and_db(client):
    body = client.get("/health").json()
    assert body["demo_mode"] is True
    assert body["database"] == "ok"
    assert body["service"] == "voice-receptionist-agent"


def test_health_demo_mode_follows_env(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")
    assert client.get("/health").json()["demo_mode"] is False


def test_cors_preflight_allows_local_dashboard(client):
    r = client.options("/health", headers={
        "Origin": "http://localhost:5174",
        "Access-Control-Request-Method": "GET",
    })
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5174"


def test_cors_preflight_rejects_unlisted_origin(client):
    r = client.options("/health", headers={
        "Origin": "https://untrusted.example",
        "Access-Control-Request-Method": "GET",
    })
    assert r.headers.get("access-control-allow-origin") is None


def test_db_path_honours_sqlite_database_url(monkeypatch):
    from backend.app.db import _resolve_db_path

    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/voice-test.db")
    assert _resolve_db_path() == "/tmp/voice-test.db"
    # A non-sqlite URL (e.g. Postgres) is not supported: fall back to the
    # default SQLite file instead of pointing at the wrong database.
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
    assert _resolve_db_path().endswith("receptionist.db")


def test_demo_call_books(client):
    r = client.post("/call/demo", json={})
    assert r.status_code == 200
    assert r.json()["outcome"] == "booked"


def test_demo_custom_turns_escalate(client):
    r = client.post("/call/demo", json={"turns": ["I am in terrible pain"]})
    assert r.status_code == 200
    assert r.json()["escalated"] is True


def test_book_empty_name_is_422(client):
    r = client.post("/call/book", json={
        "patient_name": "", "phone": "+91 90000 00001",
        "service": "Teeth cleaning", "slot": "2026-11-21 10:00",
    })
    assert r.status_code == 422


def test_book_unknown_service_is_not_ok(client):
    slots = client.get("/slots").json()["available"]
    assert slots
    r = client.post("/call/book", json={
        "patient_name": "Asha", "phone": "+91 90000 00001",
        "service": "Brain surgery", "slot": slots[0],
    })
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_slots_limit_clamped(client):
    r = client.get("/slots?limit=500")
    assert r.status_code == 422  # Query(ge=1, le=100)
    r = client.get("/slots?limit=5")
    assert len(r.json()["available"]) <= 5


def test_cancel_invalid_slot(client):
    r = client.post("/call/cancel", json={"slot": "not-a-slot"})
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_voice_incoming_returns_xml(client):
    r = client.post("/voice/incoming")
    assert r.status_code == 200
    assert "application/xml" in r.headers["content-type"]
    assert r.text.startswith("<?xml")


def test_voice_gather_reads_twilio_form_data(client):
    """Twilio posts urlencoded FORM data, not query params: the spoken
    result must reach the agent, or every Twilio caller hears the
    'I don't have that information' fallback for a question the KB
    answers (regression: the old query-param signature dropped it)."""
    r = client.post("/voice/gather", data={
        "SpeechResult": "What are your opening hours?",
        "From": "+919999999999",
    })
    assert r.status_code == 200
    assert "application/xml" in r.headers["content-type"]
    assert "9:00 AM" in r.text
    assert "don't have that information" not in r.text


def test_notify_sms_stays_in_demo_mode(client):
    r = client.post("/notify/sms", json={"to": "+919573719115", "body": "hello"})
    assert r.status_code == 200
    assert r.json()["sent"] is False
    assert r.json()["mode"] == "demo"


def test_live_call_session_start_turn_end(client):
    """The turn-by-turn session flow the Live Call page drives: start greets,
    each turn returns the agent reply with intent/state, end logs the call
    and returns the transcript, summary and outcome."""
    r = client.post("/call/start", params={"caller": "+919999999999"})
    assert r.status_code == 200
    assert "Sunrise Dental Clinic" in r.json()["reply"]

    r = client.post("/call/turn", json={"caller": "+919999999999", "text": "What are your opening hours?"})
    assert r.status_code == 200
    body = r.json()
    assert body["intent"] in ("hours", "faq")
    assert body["state"] == "confirm"
    assert body["reply"]

    r = client.post("/call/end", params={"caller": "+919999999999"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["outcome"] == "answered"
    assert "Agent: Hello" in body["transcript"]
    assert "opening hours" in body["transcript"].lower()
    assert body["summary"]


def test_live_call_turn_escalates_and_end_reports_it(client):
    client.post("/call/start", params={"caller": "+918888888888"})
    r = client.post("/call/turn", json={"caller": "+918888888888", "text": "I am in terrible pain and bleeding"})
    assert r.json()["intent"] == "emergency"
    assert r.json()["state"] == "escalate"
    body = client.post("/call/end", params={"caller": "+918888888888"}).json()
    assert body["escalated"] is True
    assert body["outcome"] == "escalated-emergency"


def test_call_end_without_active_call_is_not_ok(client):
    r = client.post("/call/end", params={"caller": "+917777777777"})
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_call_turn_empty_text_is_handled_not_a_crash(client):
    client.post("/call/start", params={"caller": "+916666666666"})
    r = client.post("/call/turn", json={"caller": "+916666666666", "text": ""})
    assert r.status_code == 200
    assert r.json()["intent"] == "unknown"
    assert "didn't quite catch" in r.json()["reply"]


def test_call_start_logs_abandoned_call(client):
    """Starting a second call for the same number used to silently drop
    the first session — its transcript and outcome were never logged."""
    caller = "+915555555555"
    client.post("/call/start", params={"caller": caller})
    client.post("/call/turn", json={"caller": caller, "text": "What are your opening hours?"})
    client.post("/call/start", params={"caller": caller})
    calls = [c for c in client.get("/calls").json() if c["caller"] == caller]
    assert len(calls) == 1
    assert calls[0]["outcome"] == "answered"
    assert "opening hours" in calls[0]["transcript"].lower()
    # The new session is still live and endable.
    r = client.post("/call/end", params={"caller": caller})
    assert r.json()["ok"] is True


def test_call_start_with_no_caller_turn_logs_nothing(client):
    """A session that never got past the greeting is not worth a log row:
    starting over before the caller speaks must not create an empty call."""
    caller = "+915444444444"
    client.post("/call/start", params={"caller": caller})
    client.post("/call/start", params={"caller": caller})
    calls = [c for c in client.get("/calls").json() if c["caller"] == caller]
    assert calls == []
    client.post("/call/end", params={"caller": caller})


def test_notify_sms_twilio_api_error_is_demo_record_not_500(client, monkeypatch):
    """Twilio keys set but the API call itself fails (bad number, bad
    credentials, outage): /notify/sms used to raise a 500. It must
    return a demo record with the error instead."""
    import sys
    import types

    import backend.app.voice.twilio_voice as tv

    monkeypatch.setattr(tv, "TWILIO_SID", "ACxxxx")
    monkeypatch.setattr(tv, "TWILIO_TOKEN", "tok")
    monkeypatch.setattr(tv, "TWILIO_NUMBER", "+15005550006")

    twilio_mod = types.ModuleType("twilio")
    rest_mod = types.ModuleType("twilio.rest")

    class FailingClient:
        def __init__(self, *a, **k):
            pass

        @property
        def messages(self):
            class _Messages:
                def create(self, **k):
                    raise RuntimeError("Unable to create record: bad number")

            return _Messages()

    rest_mod.Client = FailingClient
    twilio_mod.rest = rest_mod
    monkeypatch.setitem(sys.modules, "twilio", twilio_mod)
    monkeypatch.setitem(sys.modules, "twilio.rest", rest_mod)

    r = client.post("/notify/sms", json={"to": "+919573719115", "body": "hello"})
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] is False
    assert "Twilio send failed" in body["error"]


def test_notify_sms_missing_twilio_package_is_demo_record(client, monkeypatch):
    """Twilio keys set but the twilio package not installed: same
    guarantee — a demo record, not a 500 (round 6 fixed this path for
    the import; this pins it at the endpoint)."""
    import sys

    import backend.app.voice.twilio_voice as tv

    monkeypatch.setattr(tv, "TWILIO_SID", "ACxxxx")
    monkeypatch.setattr(tv, "TWILIO_TOKEN", "tok")
    monkeypatch.setattr(tv, "TWILIO_NUMBER", "+15005550006")
    monkeypatch.setitem(sys.modules, "twilio", None)

    r = client.post("/notify/sms", json={"to": "+919573719115", "body": "hello"})
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] is False
    assert "not installed" in body["error"]
