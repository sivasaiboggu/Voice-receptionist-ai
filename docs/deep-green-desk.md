# Deep green reception desk

The clinic’s staff need to see what is scheduled, read the last call, and book the next patient quickly. The visual signature is an inset green desk plate with a small brass indicator. On Overview it frames today’s call count. On Live call it marks the practice line and responds to new activity. The other screens give their working area the space it needs.

The dashboard keeps the repository’s Vite, strict TypeScript, React Router, Tailwind and FastAPI stack. The route headings are available with the app shell. The booking form loads when opened. The browser still uses the same calls, appointments and analytics stores in demo mode. The direct booking form uses the existing atomic slot claim and duration checks on SQLite and Postgres.

## References reviewed before implementation

| Reference | Decision |
| --- | --- |
| [Refero Styles / Steep](https://styles.refero.design/style/75fdb89f-ca64-41b3-af36-7a78bd09448e) | Warm paper and a quiet display serif gave the overview its hierarchy. Fraunces, green and the desk plate are specific to this project. |
| [21st / Calendar date and time picker](https://21st.dev/@shadcn/components/calendar-date-and-time-picker) | Keep the selected date and its time choices distinct. That informed both the calendar and the booking dialog. |
| [Mobbin / Time picker](https://mobbin.com/glossary/time-picker) | Use a grid of exact bookable times for the clinic’s half-hour scheduling cadence. |
| [Magic UI / Animated List](https://magicui.design/docs/components/animated-list) | Animate each arriving transcript turn when the API returns it. Stored transcripts stay still. |
| [React Bits / Animated Content](https://reactbits.dev/animations/animated-content) | Use a short lift and fade as a view arrives. This dashboard uses a small native CSS transition. |
| [Uiverse / Buttons](https://uiverse.io/buttons) | Reviewed CSS press feedback. The dashboard uses a short movement on press and a stable focus ring. |
| [Inspora](https://www.inspora.design/) | The www catalog shell loaded. Product examples were unavailable in the rendered result. |
| [Designeer](https://designeer.xyz/) | The live site was unreachable and the archive returned a rate limit. Its indexed directory listing identified navigation galleries. [Archived directory](https://archive.vn/2026.09.26-133235/https%3A/designeer.xyz/) |

## Applied screen plan

| Route | Layout and behavior |
| --- | --- |
| `/` | Lead with today’s count on the inset green plate. Show appointments, handoffs and waiting messages in a secondary group. Place the schedule beside call distribution and link each recent call directly to its transcript. |
| `/calls` | Give search and filters their own rail above the inbox and transcript. Selected calls get a green surface. On narrow screens, selecting a call opens its detail, with focus on the call heading and a way back to the filtered list. |
| `/appointments` | Start on a 14-day calendar and surface the selected day’s agenda below it. Keep a status-filtered list and in-place cancellation. A modal takes service, clinic day, an offered slot, name and phone. If a slot is taken, the form refreshes availability and keeps the patient fields. |
| `/live` | Put scenarios next to the console on desktop and keep the console above progress on small screens. Show elapsed time, pending replies and the actual booking choices. The scripted booking speaks the selected slot and name. The interactive caller can choose an offer or type a reply. Finished calls provide a direct link to their persisted transcript. |
| `/settings` | Make appearance the primary control with light and dark previews. Give clinic time and API status independent groups. |
| Other paths | Provide a route back to the front desk. |

A practice call uses its own session ID. A repeated end request returns the same call ID and transcript while the session is retained. The practice console requires demo mode and shows a copyable SMS draft. The desk booking action writes an appointment and does not queue a text. The clinic phone and notification APIs remain available through their existing entry points.

## System

- **Color** uses a 12-step cream-to-green-black neutral ramp, a green primary and semantic success, caution and danger. Brass is the single accent, reserved for the clock, selected navigation icon and line signal. Mineral red would compete with urgency. A bone accent would blend into light canvas. Green, brass and their dark-mode counterparts have separate usage roles.
- **Typography** uses self-hosted Latin WOFF2 subsets of Fraunces for headings and display counts, Source Sans 3 for reading and IBM Plex Mono for time and reference values. Headings scale with the viewport. Body reading is 16–18 px at 1.6 line height, with a 68-character cap.
- **Surfaces** use the 4/8 px grid, 8 px control and 16 px panel radii, an inset hairline and a light texture on the desk plate, and three elevation levels for canvas, panels and notices.
- **Motion** uses 160 ms press feedback, 220 ms route, reply and result entrances, and 320 ms progress. Only opacity and transforms move. Reply arrivals follow actual API events. Reduced motion removes CSS animation and transitions.
- **Icons** use Lucide and the clinic desk bell mark. Controls carry visible labels or accessible names.

The sources are [CSS variables](../frontend/src/tokens.css), [JSON tokens](../frontend/src/tokens.json) and the [Tailwind theme](../frontend/tailwind.config.js).

### Measured WCAG 2.2 contrast

`node scripts/contrast-desk.mjs` converts each rendered OKLCH value to linear sRGB, computes relative luminance, and applies the WCAG contrast formula. The comparison uses 4.5:1 for text at any size and 3:1 for non-text controls and signals.

| Use | Light | Dark | AA minimum |
| --- | ---: | ---: | ---: |
| Body text on canvas | 15.26:1 | 15.26:1 | 4.5:1 |
| Body text on panel | 17.08:1 | 13.57:1 | 4.5:1 |
| Body text on selected panel | 14.30:1 | 9.28:1 | 4.5:1 |
| Secondary text on canvas | 5.61:1 | 9.74:1 | 4.5:1 |
| Secondary text on panel | 6.28:1 | 8.66:1 | 4.5:1 |
| Secondary text on muted fill | 5.17:1 | 6.89:1 | 4.5:1 |
| Secondary text on selected panel | 5.26:1 | 5.92:1 | 4.5:1 |
| Primary link on panel | 9.57:1 | 8.56:1 | 4.5:1 |
| Primary link on selected panel | 8.01:1 | 5.86:1 | 4.5:1 |
| Primary button label | 9.57:1 | 8.73:1 | 4.5:1 |
| Hovered primary button label | 12.71:1 | 10.46:1 | 4.5:1 |
| Control boundary on canvas | 3.91:1 | 5.64:1 | 3:1 |
| Control boundary on panel | 4.37:1 | 5.01:1 | 3:1 |
| Focus ring on canvas | 8.55:1 | 9.63:1 | 3:1 |
| Schedule timezone accent | 4.86:1 | 9.96:1 | 4.5:1 |
| Positive status | 6.86:1 | 6.07:1 | 4.5:1 |
| Caution status | 5.58:1 | 7.02:1 | 4.5:1 |
| Urgent status | 5.85:1 | 6.68:1 | 4.5:1 |
| Inline error on panel | 7.21:1 | 8.17:1 | 4.5:1 |
| Destructive button label | 7.21:1 | 8.21:1 | 4.5:1 |
| Chart bar on track | 4.01:1 | 5.74:1 | 3:1 |
| Rail label | 12.37:1 | 15.58:1 | 4.5:1 |
| Rail secondary label | 8.42:1 | 10.61:1 | 4.5:1 |
| Selected rail icon | 5.52:1 | 5.90:1 | 3:1 |
| Call console and counter text | 9.64:1 | 10.84:1 | 4.5:1 |
| Call console secondary text | 6.56:1 | 7.38:1 | 4.5:1 |
| Call console signal | 5.91:1 | 6.64:1 | 3:1 |

## Reproduce the build and browser checks

Run from the repository root with Python 3.12, Node 24 and Chromium. Use a new SQLite file for browser runs. The browser flow tests and the screenshot runner can book synthetic appointments.

```sh
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm ci --prefix frontend
.venv/bin/pytest -q
npm run build --prefix frontend
node scripts/contrast-desk.mjs

mkdir -p work/reception-audit
npm install --prefix work/reception-audit --no-save playwright-core@1.65.1 axe-core@4.14.1 lighthouse@13.6.0 serve@14.2.8
.venv/bin/python scripts/seed-desk-audit.py work/reception-audit/clinic.sqlite
DATABASE_URL="sqlite:///$PWD/work/reception-audit/clinic.sqlite" DEMO_MODE=1 \
  .venv/bin/uvicorn backend.app.api:app --host 127.0.0.1 --port 8001
```

In separate terminals, build and serve the dashboard, then run the browser checks.

```sh
VITE_API_URL=http://127.0.0.1:8001 npm run build --prefix frontend
npm run preview --prefix frontend -- --host 127.0.0.1 --port 4173 --strictPort
```

```sh
RECEPTION_TEST_API=http://127.0.0.1:8001 node scripts/verify-desk.mjs --screenshots --audit --flows
```

For the mobile benchmark, use the compression-enabled static server on port 4173 in place of Vite preview.

```sh
work/reception-audit/node_modules/.bin/serve -s frontend/dist -l tcp://127.0.0.1:4173
```

```sh
CHROME_PATH=chromium work/reception-audit/node_modules/.bin/lighthouse http://127.0.0.1:4173/ \
  --form-factor=mobile --output=json --output-path=work/reception-audit/lighthouse-overview.json \
  --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless --no-sandbox"
```

Set `VOICE_TEST_POSTGRES_URL` to a disposable Postgres database to include the three live Postgres tests. For before screenshots, build main at `8603204564c6fa4f9b83fc82bd4db16fecfde727` against a separately seeded SQLite file and point `RECEPTION_SCREENSHOT_URL` at that preview.

## Launch review

- Check the configured API origin and `VITE_API_URL` on the preview. Confirm that demo mode points to demo data.
- Check the clinic’s time zone and service schedule, then perform one booking and cancellation in demo mode.
- Verify the call log after a practice booking and a practice handoff.
- The dashboard intentionally carries `noindex, nofollow`. Treat the SEO crawlability score in that context.
- The practice turn state and close retry cache are process-local, like the original call session table. A multi-worker deployment would need shared session storage or routing affinity.

Future product work, in order of fit, includes a callback queue, appointment rescheduling, visit reminders, transcript redaction, audit history, role-based access, provider handoff reporting, a clinic holiday calendar, translated caller scripts, and availability by dentist.
