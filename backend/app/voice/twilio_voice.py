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

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")


def twiml_gather(prompt, action="/voice/gather"):
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Gather input=\"speech\" action=\"{action}\" method=\"POST\" "
        f"speechTimeout=\"auto\"><Say voice=\"Polly.Aditi\">{prompt}</Say>"
        f"</Gather><Say>Sorry, I didn't hear you. Goodbye.</Say></Response>"
    )


def twiml_say(text):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Say voice=\"Polly.Aditi\">{text}</Say></Response>"
    )


def send_sms(to, body):
    """Send an SMS via Twilio if configured; otherwise return a demo record."""
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_NUMBER):
        return {"sent": False, "mode": "demo", "to": to, "body": body}
    from twilio.rest import Client

    client = Client(TWILIO_SID, TWILIO_TOKEN)
    msg = client.messages.create(body=body, from_=TWILIO_NUMBER, to=to)
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
