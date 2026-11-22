# Reception desk redesign

## Design brief

Voice Receptionist is a web dashboard for Sunrise Dental Clinic. The front desk needs to find the next patient, understand what happened on a call, and verify that the receptionist handles routine questions and handoffs. The design uses real booking and call records from the existing API and identifies simulated data when the API reports demo mode.

**Signature idea.** The ruled register gives dates, timestamps and speaker labels a fixed left gutter. Hairlines carry the eye across each entry. A short accent rule marks the next appointment, the selected call or the active step. Those marks all answer the same question: where should I look now?

| Accent option | Decision |
|---|---|
| Burnt copper | Selected. Clear on bone and charcoal, with enough separation from urgent red and success green. |
| Ink blue | Familiar from the current app. It would make this redesign feel closer to the previous screen palette. |
| Pine | Calm and readable. It would make active navigation look like a success state. |

Copper is limited to action text, focus rings, small marks and the primary button. Charts use neutral and semantic marks with visible values. Geist Variable is the single display and text family, self-hosted from the pinned Latin subset. System mono is reserved for the register’s time and date fields. Type uses fluid display sizes and a 16–18px reading size with a 1.6 line height and a 68ch limit.

Use 4px for related labels, 8px within controls, 16px for row rhythm, 24px within sections, and 32–48px between sections. Controls use 4px corners. The transcript sheet gets a fine inner edge. Elevation has three levels: the flat page, the transcript sheet and the notification. Grain is a low-opacity background tile. Rows draw in one pass. Brief spring-like opacity and position changes mark a new conversation turn or notification. Reduced motion disables them.

## Sitemap and interaction plan

| Screen | Layout and behavior |
|---|---|
| Overview `/` | “Front desk” establishes the clinic day. Calls answered gets the lead figure, while bookings, escalations and callbacks sit in a narrower line of figures. Today’s appointments lead the register with a labelled next slot. Recent calls link straight to their transcripts. Small horizontal plots retained for call outcomes and caller sentiment. |
| Calls `/calls` | A labelled filter bar sits above an asymmetric register and transcript. The list shows time, caller, summary and flags. Select a call to open its transcript and copy its URL. Search includes transcripts. Outcome, urgency and escalation filters keep their existing behavior. A narrow viewport shows one pane at a time and offers a return link. |
| Live call `/live` | Scenario and progress sit beside the conversation. Each turn gets a speaker gutter. Run a script or type caller turns, end the call and read the logged summary. The exact SMS copy sits on a ruled sheet with copy and send actions. |
| Settings `/settings` | Appearance comes first, then the clinic timezone and read-only API status. Appearance saves to this browser. “Check connection” refreshes the existing health endpoint. |
| Appointments `/appointments` | A chronological list uses the same time gutter, with the existing 14-day calendar and status filter. Confirm cancellation in place in either view. |
| Unknown route | “Page not found” and a route back to Overview. |

The quickest first-use flow is **Live call → Booking → Run scenario → Call summary**. It uses the same API as interactive calls. Initial loads show a short status and skeleton rows, with an inline retry for data errors. Empty screens say what is missing and offer a next action where one exists.

## Architecture

React, TypeScript, React Router, Vite and Tailwind fit the existing client-rendered dashboard and its deploy path. The frontend maps the API’s existing call, appointment, analytics and health records directly into the views. The app shell shares health and clinic time across routes. The URL owns the selected call. Local browser storage owns appearance. The API owns calls, bookings, cancellations and SMS delivery. There is no new database schema or production service.

`frontend/src/tokens.json` records the neutral scale, semantic pairs, spacing, font roles and depth values. `tokens.css` provides the browser’s hex and OKLCH declarations. `tailwind.config.js` exposes the same roles to utilities, and `index.css` holds the layout and reusable UI styles.

## Contrast

These ratios use WCAG relative luminance for the sRGB values in the token file. Chromium also rendered the OKLCH variables into an sRGB canvas and reproduced the table within 0.02:1. Hairlines are decorative separators. Control outlines, focus indicators and chart marks use the higher-contrast roles.

| Rendered pair | Light | Dark | Minimum |
|---|---:|---:|---:|
| Body text / canvas | 15.48:1 | 16.61:1 | 4.5:1 |
| Body text / sheet | 16.61:1 | 14.58:1 | 4.5:1 |
| Secondary text / canvas | 6.03:1 | 6.72:1 | 4.5:1 |
| Secondary text / sheet | 6.47:1 | 5.90:1 | 4.5:1 |
| Secondary text / selected row | 5.52:1 | 4.98:1 | 4.5:1 |
| Accent text and focus / canvas | 6.39:1 | 7.69:1 | 4.5:1 |
| Accent text and focus / sheet | 6.86:1 | 6.75:1 | 4.5:1 |
| Accent text / selected row | 5.85:1 | 5.70:1 | 4.5:1 |
| Primary button text / fill | 6.86:1 | 7.69:1 | 4.5:1 |
| Primary button text / hover | 9.14:1 | 9.43:1 | 4.5:1 |
| Danger button text / fill | 7.95:1 | 8.52:1 | 4.5:1 |
| Urgent text / canvas | 7.40:1 | 8.52:1 | 4.5:1 |
| Urgent text / tag | 6.42:1 | 6.54:1 | 4.5:1 |
| Success text / tag | 6.24:1 | 7.21:1 | 4.5:1 |
| Warning text / tag | 5.92:1 | 7.21:1 | 4.5:1 |
| Control outline / canvas | 4.41:1 | 3.51:1 | 3:1 |
| Control outline / sheet | 4.73:1 | 3.08:1 | 3:1 |
| Neutral chart mark / track | 5.52:1 | 4.98:1 | 3:1 |
| Success chart mark / track | 6.18:1 | 7.38:1 | 3:1 |
| Urgent chart mark / track | 6.78:1 | 6.30:1 | 3:1 |

## Run and review

Use Node 20.19+ on the Node 20 line, or Node 22.12+ and Python 3.11+. Direct frontend package versions are exact in `frontend/package.json`. The lockfile pins transitive packages. React 18 and Tailwind 3 remain on the repo’s existing majors. Vite and React Router were updated to clear the inherited npm audit findings.

From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
DEMO_MODE=true DATABASE_URL=sqlite:///./reception-review.db .venv/bin/uvicorn backend.app.api:app --port 8001
```

In a second terminal:

```sh
npm --prefix frontend ci
VITE_API_URL=http://localhost:8001 npm --prefix frontend run build
npm --prefix frontend run preview
```

`VITE_API_URL` is the browser-facing API URL at build time. In production, use the deployed API origin and include the frontend origin in `CORS_ORIGINS`. The local ports above are covered by the API defaults. `VOICE_TEST_POSTGRES_URL` enables the three integration tests against a disposable database because those tests clear their data tables.

With Chromium available, `node scripts/shots.mjs` captures the preview to `work/reception-screenshots`. Use `CHROME_PATH` for a custom browser path, `RECEPTION_SCREENSHOT_URL` for a different local preview URL, or `RECEPTION_SCREENSHOT_DIR` for a custom output folder. With a disposable demo database, pass `--run-demo` to also capture the completed conversation and SMS preview.

## Launch checklist and risks

- Verify the deployed API origin and health check, then confirm the displayed clinic time zone.
- Run a booking and emergency scenario with demo data, check the stored calls, and exercise the cancellation confirmation.
- Review the SMS preview before configuring delivery. Live delivery depends on the existing Twilio environment.
- Review clinic access controls before using live patient records. Search-engine directives keep these operational screens out of results. The manifest provides an app icon and standalone window without a service worker caching transcripts. Open Graph metadata is text-only. Real-data access controls, public legal pages and backend monitoring belong to the deployment.
- Supported dashboard routes use the site root and the existing host rewrite. The built app and screenshot runner use HTTP preview.
- The call list, linked transcripts and charts cover the 50 records returned by the current API. Analytic totals cover all stored records. A deep link can age out of the list.
- The simulator uses the existing shared demo caller number. Its UI serializes requests within a tab. Simultaneous sessions in separate browsers may still compete for the same caller.
- A local Lighthouse run measures a lab build and local API. Production latency and live Twilio delivery require deployment-side verification.

## Possible next iterations

1. Add server-side call pagination so older transcript links stay usable.
2. Offer a dedicated escalation queue for the front desk.
3. Surface callback disposition and ownership.
4. Add caller-number masking for shared screens.
5. Group the call register by clinic date.
6. Add transcript search highlights and jump links.
7. Let staff filter the appointment calendar by service.
8. Show confirmation delivery status on the booking.
9. Give each simulation a unique backend session identifier.
10. Add staffed shift handoff notes to Overview.
