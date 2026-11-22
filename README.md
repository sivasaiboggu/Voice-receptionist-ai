# Voice Receptionist Agent

A complete, production-grade AI agent that **answers real phone calls** for a
business or clinic, books appointments, answers FAQs from a cited knowledge
base, and escalates to a human when it should.

> "Hello, thank you for calling Sunrise Dental Clinic…"

## What it does

- **Voice agent core** — hand-rolled state machine:
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

## Dashboard

- **Overview** shows the clinic schedule, call totals and recent outcomes.
- **Calls** pairs a searchable register with the selected call’s transcript.
- **Appointments** provides a chronological list, a 14-day calendar and cancellation.
- **Live call** runs scripted scenarios or typed caller turns with the real API.
- **Settings** stores appearance in the browser and reports the clinic connection.

The [redesign notes](docs/reception-desk-redesign.md) cover the ruled
register, light and dark OKLCH tokens, measured contrast and local review.

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
.venv/bin/python -m pytest tests/ -q             # 109 tests (112 with a live Postgres, see below)
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
cd frontend && npm ci && npm run dev   # http://localhost:5174
npm run build                                # production build (verified)
```

Docker:

```bash
docker compose up --build
```

## 2-minute demo flow

0:00 — Dashboard → **Live call** → "Run scenario"
0:20 — Watch the steps: Greet → Understand → Answer or book → Confirm → Log call
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

## What changed in v0.3.7 (master-prompt polish: booking continuations, OKLCH tokens, the day book)

- **Logic — a name-only or bare-time reply no longer dies on the RAG fallback**: after the agent offered slots and asked "Which time works for you, and may I have your name?", a caller answering with just a time ("2026-11-23 10:00") or just a name ("My name is Rahul") was told "I don't have that information", because both classify as faq, not book. The agent now treats those replies as the booking continuation they are — a remembered name and service book once the missing half arrives, and a fresh "Is 2026-11-23 10:00 free?" checks the slot instead of answering from the knowledge base (which used to reply with the parking line). All four name patterns ("My name is …", "This is …", "I'm …", "Call me …") book; a name or service remembered for one booking is never reused after the caller moves on (a price question clears it). Tested: 12 new tests in `tests/test_booking_continuation.py`.
- **Logic — `extract_name` no longer takes a state or an acknowledgement for a name**: "Yes" after "may I have your name?" used to book the patient as "Yes", and "I am fine" / "I'm sorry" / "I am sick" extracted "fine" / "sorry" / "sick" as the name. Bare acknowledgements and a small state-word list are now refused. "I am in terrible pain" was already refused (emergency intent) and still is. Tested.
- **Logic — a wrong name on cancel no longer ends the cancel**: the agent said "No appointment under that name" and dropped the pending cancel, so the right name on the next turn fell through to the RAG fallback. It now keeps the cancel open and invites the name the booking is under; only when nothing is booked on the slot at all does the cancel clear. Tested.
- **UI — OKLCH tokens** (`frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/src/tokens.json`, `docs/design-tokens-0.3.7.md`): the same palette converted from HSL to OKLCH with hex fallbacks, one blue accent, display (Satoshi 700) + text (Satoshi 400/500) + mono (system stack, slot times / timestamps / phone numbers only). The conversion caught a real defect: destructive `#ef4444` gave white text 3.61:1, below WCAG AA — it is now `#dc2626` (4.62:1) in both modes. Full contrast table in the doc; every text pair passes AA.
- **UI — the day book**: one ruled row pattern — mono time gutter + 1px hairlines — shared by Today's appointments and Recent calls; the next appointment today (clinic time) carries the single 2px primary rule and a `Next` label. The sentiment pie maps colours by name (positive emerald, negative red, neutral slate); the indigo fourth colour is gone. The Live-call primary CTA lost its `shadow-glow` (the `glow` shadow is removed from the theme). StatCard icon chips gain dark-mode `-400` text shades.
- **UI — found by real renders this round**: after a finished call the step indicator left "Log call" grey even though the call was logged — it now gets its check (`setStep(STEPS.length)`); and the mobile full-page capture compressed the Recharts charts, a `captureBeyondViewport` artefact (the same page renders correctly in a viewport capture and the DOM measures a correct 308px chart) — `scripts/shots.mjs` now sizes the viewport to the content height for the 390px shot instead.
- **Tests** — 109 passed, 3 skipped on SQLite (the 3 live Postgres tests, skipped without `VOICE_TEST_POSTGRES_URL`); 13 new this round: <redacted> the cancel name-retry.
- **Visual proof** — docs/visual-proof-0.3.7/ (same script, `scripts/shots.mjs`, output folder bumped; PNGs local-only, not committed). Counts moved between captures (23 calls / 20 booked at the first capture, 25 / 22 after the live-call runs) because each scripted live-call run logs another real call. The Cancelled filter shows the honest empty state this round — no appointment is currently cancelled (a cancelled slot becomes bookable again and later demo runs rebooked it). The Sunday-hours tension is unchanged — still Siva's call.

## What changed in v0.3.6 (cancel is name-checked, prices answer first, playbook pass)

- **Logic — cancelling by time alone is gone**: the agent used to cancel whoever's appointment sat on the named slot — any caller could cancel anyone else's booking by naming its time — and a booking turn given while the agent waited for a time to cancel ("book 2026-11-23 10:00") was treated as a cancel confirmation. Cancelling now asks for the caller's name and checks it against the booking (a wrong name fails, the right name cancels), and a booking/hours/price/services/emergency/human/message turn while waiting to cancel falls through to normal handling instead of cancelling. Naming the name in the same turn ("cancel … on 2026-11-23 10:00, I'm Asha") cancels at once. Tested: wrong-name cancel fails, same-turn name cancels, booking turn while waiting does not cancel.
- **Logic — "My name is Rahul" books**: when the agent asked for a name, only a bare name matched, so a natural reply fell through to the RAG "I don't have that information" fallback. "My name is …", "This is …", "I'm …" and "Call me …" now book too. The name check only applies to booking and cancel turns, so "I am in terrible pain" is never taken as a name. Tested.
- **Logic — the price question was answered with slots**: "How much does cleaning cost?" came back as a list of booking slots, because intent classification checked booking before price and "cleaning" is a booking keyword. Price is now checked before booking; a booking request with no price words still books. The demo call's price turn now answers with the cited prices ("Consultation Rs 500. Cleaning Rs 1,500. Filling Rs 1,800. (Source: pricing.md, services.md)"), matching the README's demo-flow claim. Tested, including a test that replays the demo call's price turn against the live agent.
- **Logic — `/analytics` no longer reports a hardcoded answer rate**: it returned `answer_rate: 1.0` whenever any calls existed. The field is removed; the endpoint now reports `calls_today`, counted from the real call log in clinic time (unparseable stamps skipped). Tested.
- **Logic — `available_slots()` on a fresh database returned nothing**: slot seeding only happened at API import / agent creation, so the CLI printed an empty list on a fresh DB. Seeding (INSERT OR IGNORE, idempotent) now runs inside `available_slots()` too. Tested.
- **UI — design-playbook pass (docs/design-references-0.3.6.md)**: type is now Satoshi (Fontshare, self-hosted woff2, 400/500/700), one family, with tabular figures throughout — verified with fontTools to ship a real `tnum` feature (General Sans was tried first and rejected: proportional digits, no `tnum`). Google Fonts links are gone, so the app no longer depends on a network font fetch. Decorative gradients are out (greeting, logo mark, active-nav pill, bar-chart fill, caller bubbles, transcript panel, empty-state chips, skeleton), the skeleton is a plain pulse, and charts draw their final shape immediately (`isAnimationActive={false}`).
- **UI — playbook slop checklist, now enforced by the build**: frosted surfaces are solid (sidebar, topbar, mobile nav, toasts — no `backdrop-blur` anywhere), staggered entrances are gone (stat cards, charts, call rows and appointment cards render at once; dead `.rise` CSS removed), the live badge's breathing glow and ping dot are gone (a solid dot plus the running call timer shows liveness), and hover lifts are gone from cards and calendar days (hover is a flat background or border tint). Motion that stays marks a state change: new chat bubbles, the call summary appearing, toasts, typing dots. The copy-guard test now fails the build on `backdrop-blur`, staggered-entrance patterns (`delay:` / `delay={` / `stagger`) and `animate-ping`, as well as emoji, decorative symbols and banned marketing words. The guard caught a violation in my own StatCard comment during this round — the comment was reworded and the test passes.
- **UI — found by real renders this round**: the Overview "Recent calls" rows collapsed to a one-word-wide column at 390px (caller number, date and badges left the summary ~60px). The summary now takes the full row width on small screens and flexes beside the meta line from `sm` up. Verified by re-rendering the 390px shot.
- **Config — Vite base is relative, unused deps removed**: the build emitted absolute `/assets/...` paths, so file:// renders (and GitHub Pages under a subpath) came out blank; `base: './'` fixes it. `langgraph` and `langchain-core` are removed from `backend/requirements.txt` — imported nowhere; the agent is a hand-rolled state machine, and the README and agent docstring now say so.
- **Visual proof** — rendered headlessly against the live backend + production build, real demo data (docs/visual-proof-0.3.6/, PNGs kept local only — the snapshot push accepts UTF-8 files, so binary renders are not pushed): Overview light + dark + 390px mobile, Calls with an expanded transcript, Appointments list + calendar, the Cancelled filter showing the one cancelled appointment, Live call after a completed scripted run, and the call summary with the phone-frame SMS preview. The counts moved between captures (20 calls / 18 booked at the first capture, 21 / 19 after the live-call runs) because each scripted live-call run logs another real call. The render script's debug port moved from 9227 to 9233 — the AI SDR agent's headless Chrome holds 9227 on this VM and the script was driving that agent's page instead of this project's. Dark mode was rendered by setting the app's own theme key, not a browser force-dark. The bar chart's "escalated-eme…" x-label truncation is a pre-existing tick-formatter quirk, left as is. The Sunday-hours tension (knowledge base says emergencies only, engine still generates ordinary bookable Sunday slots) is unchanged — still Siva's call.
- **Tests** — 96 passed, 3 skipped on SQLite (the 3 live Postgres tests, skipped without `VOICE_TEST_POSTGRES_URL`); 13 new this round: 7 cancel-flow tests (including fresh-DB slot seeding and analytics `calls_today`), 2 copy-guard tests (emoji/decorative symbols, banned marketing words) plus 3 more guard tests (frosted surfaces, staggered entrances, breathing dots), and 1 price-intent test that replays the demo call's price turn against the live agent. No live Postgres run this round.
- **Dependencies** — `langgraph` and `langchain-core` removed (unused). No other changes.

## What changed in v0.3.5 (overlap race closed + visual proof)

- **Logic — the round-7 residual overlap race is closed**: two simultaneous requests for overlapping-but-different slots (10:00 cleaning, 10:30 checkup) could both pass the overlap check before either claimed, because the atomic claim only protected the *same* slot. Booking and cancel now run check+claim under one lock — `BEGIN IMMEDIATE` on SQLite, a transaction advisory lock (`pg_advisory_xact_lock`) on Postgres — so the whole check-then-claim serialises. A Postgres `EXCLUDE` constraint was considered and rejected: SQLite (the default backend) has no exclusion constraints, and a Postgres-only constraint would leave the default path racy while needing range columns the schema does not have. Concurrency tests assert exactly one booking wins — 4 threads on SQLite (same slot + overlapping slots) and 2 threads live on Postgres.
- **Logic — the agent no longer promises a slot inside a booking**: a 10:30 request during a 10:00–10:45 cleaning looked free by its slot row (only starting slots are ever flipped), so the agent said "10:30 is available" and only failed once the caller named a service. `_handle_book` now checks `slot_start_blocked()` first and offers alternatives instead; tested.
- **Logic — evicted sessions are no longer lost**: when the 100-session table filled up, the oldest session was dropped without logging, even though `/call/start` already logged abandoned same-number sessions. Eviction now ends the session first (greeting-only sessions still log nothing); tested with a 2-session cap.
- **UI — Appointments list gains a status filter**: cancelled appointments sat mixed in with booked ones with no way to separate them. A All/Booked/Cancelled filter sits next to the List/Calendar toggle, with an honest empty state ("No cancelled appointments") and a Show-all reset.
- **Visual proof** — rendered headlessly against the live backend + production build, real demo data (docs/visual-proof-0.3.5/, PNGs kept local only — the snapshot push accepts UTF-8 files, so binary renders are not pushed): Overview light + dark, Calls with an expanded transcript, Appointments list + calendar, the new Cancelled filter showing only the cancelled appointment, Live call after a completed scripted run, and the call summary with the phone-frame SMS preview. Dark mode was rendered by setting the app's own theme key, not a browser force-dark. The dark Overview shows 4 calls / 6 booked because the live-call run that produced the run shots logged one more call before the dark capture.
- **Tests** — 83 passed, 3 skipped on SQLite (the 3 live Postgres tests, skipped without `VOICE_TEST_POSTGRES_URL`); 86 passed, 0 skipped against a local Postgres 16. 5 new tests: the overlap concurrency test, the same-slot concurrency test, `slot_start_blocked`, the agent's no-false-promise reply, and session-eviction logging. The Sunday-hours tension (knowledge base says emergencies only, engine still generates ordinary bookable Sunday slots) is unchanged — still Siva's call.
- **Dependencies** — no changes this round.

## What changed in v0.3.4 (service durations are real + visual proof)

- **Logic — a 45-minute cleaning occupies 45 minutes**: slots are 30 minutes apart but services run 30/45/60 minutes, and only the starting slot was marked unavailable — so a 10:30 booking could land inside a 10:00 cleaning (ends 10:45) and double-book the dentist. Booked appointments now hold their full interval: overlapping slots are not offered, cannot be booked, and are freed again on cancel. `available_slots(service=...)` finally honours its argument (it was accepted and ignored); `GET /slots?service=` filters the same way, and the demo call and the Live-call page request slots for the service they book.
- **Logic — services must fit before lunch/closing**: a 13:00 root canal (ends 14:00) ran into the 13:30–14:30 lunch break and a 19:30 root canal ran past the 8 PM close; both were bookable. Validation now refuses a service that would overrun the window it starts in (a 13:00 checkup ending exactly at 13:30 is still fine). Window logic is now one helper (`_day_windows`), used by slot generation too.
- **Logic — the agent no longer offers an empty list**: when no slots were free, a named past/outside-hours/booked slot got "our next available times are: . Which one works for you?". All three branches now fall back to an honest no-availability message. A named slot without a service is now remembered across turns: naming the service next ("Teeth cleaning") or giving your name first no longer loses the slot (the name-first case used to fall through to the RAG "I don't have that information" reply).
- **Logic — small hardening**: `end_call` now logs sentiment/urgency from the whole call, not just the last turn (a caller who shouted in pain and then said "thanks" was logged positive/low); `/call/start` logs an abandoned session for the same number instead of silently dropping it (a greeting-only session logs nothing); `/notify/sms` returns a demo record instead of a 500 when the Twilio API call itself fails (bad number/credentials/outage), matching the round-6 missing-package fix — both paths are now tested.
- **UI — found by real renders this round**: `CardHeader`'s base is `flex flex-col`, and Tailwind orders `flex-col` after `flex-row` in the stylesheet, so `flex-row` on a CardHeader silently lost — the Calls and Appointments card headers (and the new Overview card) rendered stacked and centred. Row layouts now live on an inner div in all three places. Overview gains a "Today's appointments" card (clinic-local today, real data) with a gradient greeting, recent calls show when each call happened, appointment cards show "Today/Tomorrow/weekday" instead of a bare date, and call transcripts render as speaker-styled lines (Caller lines carry a primary accent bar) instead of a plain `<pre>`.
- **Visual proof** — rendered headlessly against the live backend + production build, real demo data (docs/visual-proof-0.3.4/): Overview light + dark, Calls with an expanded transcript, Appointments list + calendar, Live call after a completed scripted run, and the call summary with the phone-frame SMS preview. The two early `virtual-time-budget` captures caught Recharts/framer-motion entrance animations mid-flight (empty bars, missing donut); the kept shots use real-time waits. Dark mode was rendered by setting the app's own theme key, not a browser force-dark.
- **Tests** — 78 passed, 2 skipped (Postgres live tests, unchanged): 18 new — service-duration overlap, lunch/closing overrun, the service filter, the pending-slot conversation, whole-call signals, the empty-list reply, abandoned-call logging, and both SMS failure paths. Three existing tests now ask for slots that fit the service they book (the first free slot overall can be 19:30, which a 45-minute cleaning would run past closing).
- **Dependencies** — no changes this round.

## What changed in v0.3.3 (premium UI pass + senior logic review)

- **Logic — `/voice/gather` fixed**: Twilio posts urlencoded form data, but
  the endpoint read `SpeechResult`/`From` as query params, so every real
  caller line arrived as `""` and the agent answered the "I don't have
  that information" fallback. Now `Form(...)` params; a test posts form
  data and asserts the hours answer.
- **Logic — lunch-break slots**: slot generation offered 14:00/14:30
  appointments while the knowledge base says lunch is 13:30–14:30 with
  no appointments. Windows are now 9:00–13:30 and 14:30–20:00; a test
  pins the edges.
- **Logic — small hardening**: the agent now sets `intent` on the
  early-return paths (cancel slot, take message, pending-name booking)
  instead of leaking the previous turn's intent to `/call/turn`;
  `send_sms` returns a demo record instead of a 500 when Twilio keys
  are set but the `twilio` package is missing; the Live-call page's
  End-call path can no longer race with the scripted loop and overwrite
  the real summary with an empty `{ok: false}` result; the Appointments
  calendar now starts on today in the clinic timezone instead of the
  browser's date; dead code removed (`timeAgo`, `api.demoCall`,
  `api.messages` client wrappers — backend endpoints untouched).
- **UI — premium pass**: refined design tokens (0.875rem radius, shared
  `--ring`, soft/lift/glow shadows, slim theme-aware scrollbars, selection
  tint); glass sidebar/header/mobile nav with an aurora wash; gradient
  brand mark and active-nav pill; caller bubbles as a primary gradient,
  agent bubbles as soft-shadowed cards; step connectors fill as the call
  progresses and the Live badge breathes; the SMS preview is a real
  phone frame (notch, live clock, signal/wifi/battery); the calendar
  has a month header, hover lift and status dots; the outcome bar chart
  uses a vertical gradient and the sentiment donut shows its total in
  the centre. No behaviour changes, no fake data.
- **Dependencies** — no changes this round: every available frontend
  update is a major (React 19, Tailwind 4, Vite 8, framer-motion 14,
  recharts 3, react-router 7, TypeScript 7) and the backend updates are
  transitive-only (protobuf 5 → 7 and uuid-utils 0 → 1 are majors, still
  held back as in v0.3.2).
- **Tests** — 60 passed, 2 skipped (the 2 live Postgres tests, skipped
  without `VOICE_TEST_POSTGRES_URL`); with a local Postgres 16 the full
  suite is 62 passed, 0 skipped.

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
