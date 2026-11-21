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
| Database | SQLite (free, default) | No |
| Hosting (demo) | Vercel (frontend) / Render free tier (backend) | No |

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
.venv/bin/python -m pytest tests/ -q             # 58 tests (60 with a live Postgres, see below)
```

Run the API:

```bash
.venv/bin/uvicorn backend.app.api:app --port 8001
# GET  /health        GET  /analytics   GET  /calls
# POST /call/demo     GET  /slots       GET  /appointments
# POST /call/cancel   GET  /messages
# POST /voice/incoming   (Twilio webhook, returns XML TwiML)
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

## Deployment

Frontend and backend deploy separately — the dashboard is a static Vite
site, the API is a FastAPI service. Do not point the deployed frontend
at `localhost`: a visitor's browser can never reach your machine.

### Frontend — Vercel

1. In Vercel, create a project from this repo with **Root Directory `frontend`**
   (`frontend/vercel.json` already sets the Vite build, `dist` output, and
   the SPA rewrite so `/calls`, `/appointments`, `/live` load on refresh).
2. Set the environment variable **`VITE_API_URL`** to the deployed backend
   URL, e.g. `https://voice-receptionist-api.onrender.com` (no trailing
   slash). Without it, production builds fail fast with a configuration
   error instead of silently calling localhost. Local dev needs nothing —
   it defaults to `http://localhost:8001` (or `/api` via the Vite proxy).
3. Deploy. Verify: open the site — the sidebar shows "Agent online" only
   when `GET /health` on the backend actually answers.

### Backend — Render (or any host running Python)

1. Create a Web Service from this repo, start command:
   `uvicorn backend.app.api:app --host 0.0.0.0 --port $PORT`
   (Render sets `$PORT`; the start command passes it to uvicorn).
   Install with `pip install -r backend/requirements.txt`.
2. Set environment variables: `CORS_ORIGINS=https://<your-frontend>.vercel.app`
   (without this the browser blocks every API call, even though curl works),
   `DATABASE_URL=sqlite:///./receptionist.db`, `DEMO_MODE=true`.
   Add `GEMINI_API_KEY` / Twilio keys only if you want real calls/SMS.
3. Verify: `curl $API_URL/health` → `{"ok": true, "database": "ok", ...}`.
   Then set `VITE_API_URL` to this URL in Vercel and redeploy the frontend.

> SQLite note: calls, appointments and slots live in `receptionist.db`.
> On Render's free tier the filesystem is ephemeral — data resets on
> restart/redeploy unless you attach a persistent disk and point
> `DATABASE_URL` at it (e.g. `sqlite:////var/data/receptionist.db`).
> Since v0.3.1, `DATABASE_URL` can also be a Postgres URL
> (`postgresql://USER:PASSWORD@HOST:5432/receptionist`); the schema is
> created on first connect and SQLite stays the fallback.
> `docker-compose.yml` also ships an optional Postgres 16 service (`db`).

### Local production check

```bash
.venv/bin/uvicorn backend.app.api:app --port 8001 &
cd frontend && npm run build && npm run preview   # http://localhost:4173
curl localhost:8001/health
```

## What changed in v0.3.2 (dashboard honesty fixes, patch dependency updates)

- **Live call page** — the pulsing "Live" dot no longer floats to the wrong
  spot: its wrapper was missing `relative`, so the pinging dot positioned
  against the page instead of the badge. The SMS preview now counts its
  segments from the real draft length (`ceil(len / 160)`) instead of
  hardcoding "1 SMS segment" — today's demo drafts are one segment, but a
  long patient name or service can push a draft over 160 characters.
- **Overview charts** — Recharts tooltips, axis labels, grid lines and the
  pie legend now use the theme tokens, so they read correctly in dark mode
  instead of showing a fixed white tooltip box and dim grey labels.
- **Dependencies** — safe patch bumps only: `langgraph` 1.2.23 → 1.2.24,
  `langchain-core` 1.8.3 → 1.8.4, `autoprefixer` 10.6.2 → 10.7.0. Held
  back deliberately: React 19, Tailwind 4, Vite 8, framer-motion 14,
  recharts 3, react-router 7 and TypeScript 7 are all major-version jumps
  and were not attempted; protobuf 5 → 7 and uuid-utils 0 → 1 are majors
  too, and the google-generativeai 0.8.6 stack pins protobuf < 6.
- **Tests** — 58 passed, 2 skipped (the 2 live Postgres tests, skipped
  without `VOICE_TEST_POSTGRES_URL`); with a local Postgres 16 the full
  suite is 60 passed, 0 skipped. A new `pytest.ini` pins the
  asyncio fixture loop scope and silences the pytest-asyncio deprecation
  warning that printed on every run.

## What changed in v0.3.1 (Postgres support)

- **Postgres is wired up** — `backend/app/db.py` now honours
  `DATABASE_URL`: a `postgres://` / `postgresql://` URL connects via
  `psycopg` (v3, added to `backend/requirements.txt`) and creates the
  schema on first connect; SQLite stays the default and the fallback
  when the URL is unset or a `sqlite://` URL. No credentials are
  hardcoded — the URL comes from the environment only. The same
  `?`-placeholder calls work on both backends through a small
  translation wrapper (`INSERT OR IGNORE` becomes `ON CONFLICT DO
  NOTHING`), so booking, the agent and the API are unchanged.
  `docker-compose.yml` gains an optional Postgres 16 service (`db`),
  and the previously missing `frontend/Dockerfile` now exists, so
  `docker compose up --build` works (both Dockerfiles build-tested).
- **Tests** — 58 passed, 2 skipped (was 54): new `tests/test_postgres.py`
  covers the SQL translation, the `_Row` shape (`row[0]`, `row["col"]`,
  `dict(row)`) and the full booking flow on Postgres (seed, book,
  double-book rejected, cancel, re-book); the 2 live tests run only when
  `VOICE_TEST_POSTGRES_URL` is set and pass 6/6 against a local
  Postgres 16.

## What changed in v0.3.0 (advanced UX)

- **Live call, turn by turn** — the Live Call page now drives the real
  session API (`/call/start` → `/call/turn` → `/call/end`) instead of
  running the whole demo in one request: each exchange appears as a chat
  bubble as it lands, with a typing indicator, a live call timer, and a
  step indicator driven by the agent's real state. You can also talk to
  the agent yourself — type the caller's lines free-text. Scripted
  scenarios still auto-book the first free slot when the call is not
  escalated, exactly as the demo did.
- **SMS preview before sending** — after a call ends, the follow-up SMS
  draft shows in a phone-style preview with a character count, a copy
  button, and a Send button that calls `POST /notify/sms`. The result is
  reported honestly: in demo mode it records the draft and sends nothing
  (no Twilio keys); with Twilio configured it really sends.
- **Calls: search + filters** — search caller, summary or transcript,
  filter by outcome and urgency, escalated-only toggle, with a live
  "Showing X of Y calls" count and a clear-filters action.
- **Appointments: calendar view** — a 14-day calendar alongside the list,
  bookings grouped by day with status colours; click a day to see that
  day's appointments and cancel from there. Booking rules unchanged
  (timezone-aware, atomic slot claim). 54 tests (was 50).

## What changed in v0.2.2 (timezone-aware booking)

- **Booking is timezone-aware** — slot times are clinic-local
  (`CLINIC_TZ`, default `Asia/Kolkata`). "Past" is judged against the
  clinic clock, not the server clock: on a UTC server the old naive
  code offered slots that had already passed in India and skipped the
  first clinic day when it was already tomorrow in IST. `created_at`
  stamps are now UTC. `GET /slots` and `GET /health` report the
  `timezone` so dashboards label times instead of guessing.
- **Dashboard** — the header shows the clinic timezone (e.g. "IST
  (Asia/Kolkata)") and Appointments notes that all times are clinic
  time. Demo-data labels unchanged. 50 tests (was 39).

## What changed in v0.2.1 (production hardening)

- **Backend** — CORS via `CORS_ORIGINS` (a Vercel dashboard was previously
  blocked by the browser); `/health` now reports the real `DEMO_MODE` and
  a live database check instead of a hardcoded `true`; `DATABASE_URL` is
  honoured for `sqlite://` URLs (Postgres was claimed but never worked).
- **Frontend** — `VITE_API_URL` with a dev-only localhost default and no
  localhost fallback in production builds; a missing production API URL
  fails fast with a setup error; non-JSON responses (e.g. the SPA's own
  `index.html`) are reported as a misconfiguration, not a crash.
- **Dashboard** — the sidebar status comes from live `GET /health`
  (checking / online / offline) instead of a hardcoded "Agent online";
  Overview, Calls and Appointments are labelled **Demo data** — the
  counts come from simulated demo calls, not real patients.
- **Deploy config** — `frontend/vercel.json` (Vite + SPA rewrites),
  `frontend/.env.example`, corrected root `.env.example` (unused vars
  marked as such), and this Deployment section. 39 tests (was 34).

## What changed in v0.2

- **Booking is safe under concurrency** — slots are claimed with one
  atomic conditional update; past and malformed slots are rejected;
  cancelling frees the slot and it can be booked again.
- **Agent understands more, invents less** — whole-word intent matching
  ("visited" is not a booking), a real cancel/message multi-turn flow,
  named-slot booking ("book teeth cleaning on 2026-11-21 10:00" → name →
  booked), and RAG that reads `docs/kb/*.md` with cited, stemmed matching.
- **API hardening** — request validation on every write endpoint,
  `POST /call/cancel`, custom turns on `POST /call/demo`
  (try an emergency demo), and real `application/xml` TwiML responses.
- **Dashboard** — real call transcripts, retryable error states,
  consistent empty states, appointment cancel buttons, demo scenarios
  (Booking / Emergency / Price question), and a working End call button.

## Configuration

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Optional. Read by `gemini_polish()` (not yet wired into replies — today's answers come from `docs/kb/` only). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Optional. Real calls + SMS. |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` | Optional, not yet read by any code — see `.env.example`. |
| `DATABASE_URL` | `sqlite:///./receptionist.db` by default. A `postgres://` / `postgresql://` URL switches storage to Postgres (schema created on first connect). |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API. Defaults to local Vite dev servers. Set to the Vercel URL in production. |
| `VITE_API_URL` | Frontend only (set in Vercel). The deployed backend URL. Required in production; dev defaults to `http://localhost:8001`. |
| `DEMO_MODE` | `true` by default — simulated calls, no keys. Reported by `GET /health`. |
| `CLINIC_TZ` | IANA timezone slot times are in, e.g. `Asia/Kolkata` (default). "Past" is judged against this clock, not the server's. Reported by `GET /health` and `GET /slots`. |

## Safety

- Nothing is booked twice; a taken slot is rejected with an alternative.
- No price, hour or service is ever invented — answers come from `docs/kb/`
  with a source citation, or the agent says it doesn't know and takes a message.
- No API key is ever committed — use `.env`, see `.env.example`.
