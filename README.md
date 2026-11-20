# Voice Receptionist Agent

A complete, production-grade AI agent that **answers real phone calls** for a
business or clinic, books appointments, answers FAQs from a cited knowledge
base, and escalates to a human when it should.

> "Hello, thank you for calling Sunrise Dental Clinic…"

## What it does

- **Voice agent core** — LangGraph-style state machine:
  `greet → understand intent → RAG / booking / message / escalate → confirm → log call`
- **Appointment booking** — FastAPI + SQLite, 30-minute slots, **double-booking
  prevented atomically**, SMS/WhatsApp confirmation draft after every booking
- **Knowledge base / RAG** — services, prices, hours, FAQs for a realistic demo
  clinic, every answer cited, and an honest "I don't have that" when a question
  is not in the guide — nothing invented
- **Human handoff** — pain / emergencies and "speak to a human" escalate
  immediately, with urgency + sentiment flags and a message taken for callback
- **Call intelligence** — transcript + one-line summary after every call,
  sentiment / urgency flagging, follow-up SMS draft
- **Dashboard** — production-grade React dashboard (see below), live call log,
  appointments, escalation queue, analytics charts
- **Demo mode** — a full call runs end-to-end with **no phone or API keys**

## Free tools only

| Need | Free path used | Paid? |
| --- | --- | --- |
| Voice | Twilio Voice free trial / sandbox | No — optional |
| Speech | Twilio `<Gather>` STT / `<Say>` TTS | No — optional |
| LLM | Gemini free tier, mock fallback | No — optional |
| Search / RAG | Local keyword retrieval over `docs/kb/` | No |
| SMS / WhatsApp | Twilio sandbox / Meta Cloud API free tier | No — optional |
| Database | SQLite (free, default); Postgres optional | No |
| Hosting (demo) | Vercel / Render free tier | No |

No keys are hardcoded. Everything paid is optional and has a free/mock fallback.

## Dashboard — production-level UI

Not an AI-coded look. Built with real external libraries:

- **Tailwind CSS** + shadcn/ui-style components (Button, Card, Badge, Skeleton,
  Toast — in `frontend/src/components/ui/`)
- **Framer Motion** — fade/slide-in on load, animated live-call indicator,
  progress steps, toast notifications
- **Lucide** icons, **Recharts** analytics charts (call outcomes, sentiment),
  **React Router** (Overview / Calls / Appointments / Live call)
- **Dark / light theme** — polished palette, Inter typography via Google Fonts,
  consistent spacing, shadows, responsive layout (sidebar on desktop, bottom
  nav on mobile), skeleton loading, hover states
- Feels like a real SaaS product (Linear / Vercel / Stripe dashboard), not a
  demo template

## Architecture

```
Caller (phone / demo)
  |
  v
Twilio Voice ──> FastAPI ──> VoiceAgent state machine
  <Gather STT>              greet → intent → RAG / booking → confirm → log
  <Say TTS>                     |           |              |
                            docs/kb    SQLite slots   human handoff
  |
  v
React dashboard — live calls, appointments, charts, live-call simulator
```

## Quick start

```bash
cp .env.example .env
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m backend.app.main demo        # full simulated call, no keys
.venv/bin/python -m pytest tests/ -q             # 7 tests
```

Run the API:

```bash
.venv/bin/uvicorn backend.app.api:app --port 8001
# GET  /health        GET  /analytics   GET  /calls
# POST /call/demo     GET  /slots       GET  /appointments
# POST /voice/incoming   (Twilio webhook)
```

Run the dashboard:

```bash
cd frontend && npm install && npm run dev   # http://localhost:5174
npm run build                                # production build (verified)
```

Docker:

```bash
docker compose up --build
```

## 2-minute demo flow

0:00 — Dashboard → **Live call** → "Answer & run demo call"
0:20 — Watch the steps: Greet → Understand → Answer / book → Confirm → Log call
0:45 — Transcript appears: booking request, opening hours (cited), price (cited)
1:15 — Appointment booked (Teeth cleaning, first free slot), SMS draft shown
1:30 — Overview: charts + call log update; Appointments: the new booking
2:00 — Try an emergency: the agent escalates and flags urgency = high

Try it yourself via the API:

```bash
curl -X POST localhost:8001/call/start
curl -X POST localhost:8001/call/turn -H 'Content-Type: application/json' \
  -d '{"text": "I am in terrible pain, I need help today"}'
```

## Configuration

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Optional. Polishes replies (never adds facts). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Optional. Real calls + SMS. |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` | Optional. WhatsApp confirmations. |
| `DATABASE_URL` | `sqlite:///./receptionist.db` by default. |
| `DEMO_MODE` | `true` by default — simulated calls, no keys. |

## Safety

- Nothing is booked twice; a taken slot is rejected with an alternative.
- No price, hour or service is ever invented — answers come from `docs/kb/`
  with a source citation, or the agent says it doesn't know and takes a message.
- No API key is ever committed — use `.env`, see `.env.example`.
