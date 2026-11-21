"""Twilio Voice wiring (optional — demo mode needs no Twilio account).

Real call flow:
  Twilio number -> POST /voice/incoming -> TwiML <Gather> (speech)
  -> POST /voice/gather (speech result) -> agent.handle() -> TwiML <Say>
  -> booking / escalation as in agent.py

STT: Twilio <Gather input="speech">. TTS: Twilio <Say> (Polly voice).
SMS/WhatsApp confirmation: Twilio sandbox (free) or Meta WhatsApp Cloud API.
All of it is optional — demo mode simulates the same turns over HTTP.
"""
import os
from xml.sax.saxutils import escape as xml_escape

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")


def twiml_gather(prompt, action="/voice/gather"):
    # Prompt text is escaped: a caller saying "Tom & Jerry" must not break
    # the TwiML XML or inject markup.
    prompt = xml_escape(prompt)
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Gather input=\"speech\" action=\"{action}\" method=\"POST\" "
        f"speechTimeout=\"auto\"><Say voice=\"Polly.Aditi\">{prompt}</Say>"
        f"</Gather><Say>Sorry, I didn't hear you. Goodbye.</Say></Response>"
    )


def twiml_say(text):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Say voice=\"Polly.Aditi\">{xml_escape(text)}</Say></Response>"
    )


def send_sms(to, body):
    """Send an SMS via Twilio if configured; otherwise return a demo record.

    Never sends anything without Twilio credentials, and never calls the
    Twilio API with an invalid destination — bad input fails as a demo
    record with an error instead of raising.
    """
    if not to or not isinstance(to, str) or not body or not str(body).strip():
        return {"sent": False, "mode": "demo", "to": to, "body": body,
                "error": "A destination number and a message body are required."}
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_NUMBER):
        return {"sent": False, "mode": "demo", "to": to, "body": body}
    try:
        from twilio.rest import Client
    except ImportError:
        # Keys configured but the twilio package missing (e.g. a minimal
        # install): fail as a demo record, not a 500 on /notify/sms.
        return {"sent": False, "mode": "demo", "to": to, "body": body,
                "error": "Twilio is not installed on this server — SMS cannot be sent."}

    client = Client(TWILIO_SID, TWILIO_TOKEN)
    try:
        msg = client.messages.create(body=body, from_=TWILIO_NUMBER, to=to)
    except Exception as e:
        # Bad number, bad credentials, Twilio outage: the API used to
        # raise a 500 on /notify/sms. Fail as a demo record instead —
        # the dashboard shows the error and nothing is lost.
        return {"sent": False, "mode": "demo", "to": to, "body": body,
                "error": f"Twilio send failed: {e}"}
    return {"sent": True, "mode": "twilio", "sid": msg.sid}


def gemini_polish(text):
    """Optional Gemini polish — never adds facts; mock fallback returns text as-is."""
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return text
    try:
        import google.generativeai as genai

        genai.configure(api_key=key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        resp = model.generate_content(
            "Rewrite this receptionist reply in a warm, professional tone. "
            "Do not add any facts, prices or times that are not already in it:\n" + text
        )
        return resp.text.strip() or text
    except Exception:
        return text
