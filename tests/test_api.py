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


def test_notify_sms_stays_in_demo_mode(client):
    r = client.post("/notify/sms", json={"to": "+919573719115", "body": "hello"})
    assert r.status_code == 200
    assert r.json()["sent"] is False
    assert r.json()["mode"] == "demo"
