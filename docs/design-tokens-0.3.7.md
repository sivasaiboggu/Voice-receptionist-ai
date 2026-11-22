# Design tokens + Section 1 brief — Voice Receptionist v0.3.7 (master-prompt polish, 22 Nov 2026)

Round 10 deepens the round-9 identity (Satoshi, solid surfaces, no
gradients/frost/stagger/shimmer) instead of redesigning it. Inspiration
sites, from the master prompt references: **Mobbin** (Linear issue
screen, Stripe dashboard), **Cal.com** (booking clarity — one time, one
name, one confirm), **Linear** (restrained chrome, quiet sidebar).
Design from those, not from tool defaults.

## Section 1 brief (filled)

- **Name:** Voice Receptionist — Sunrise Dental Clinic dashboard
- **Type:** AI tool / clinic operations dashboard
- **What it does (1 sentence):** An AI voice receptionist answers the
  clinic's calls, books appointments, answers price and hours questions
  from a cited knowledge base, and logs every call for the front desk.
- **Target user and biggest pain:** A small dental clinic whose front
  desk misses calls when it is busy — every missed call is a patient
  who books elsewhere.
- **Core promise:** Every caller gets a correct, polite answer and a
  real booking.
- **Tone:** Calm, human, plain-spoken.
- **Colors I like or hate:** Warm white canvas, slate ink, one blue
  accent. No purple-blue gradients, no frost, no glow.
- **Reference sites:** Mobbin, Cal.com, Linear.
- **Platforms:** Web dashboard (desktop + 390px mobile).
- **Must-have features:** Live-call simulator with real backend turns,
  today's appointments, call log with transcripts, name-checked cancel,
  prices cited from the knowledge base (Consultation Rs 500, Cleaning
  Rs 1,500, Filling Rs 1,800).

## Signature visual idea — the day book

One ruled row pattern, repeated with discipline: a fixed mono time
gutter + 1px hairline separators, shared by **Today's appointments**
and **Recent calls**. The next appointment today carries the single
2px primary rule and a `Next` label. Nothing else on a row is coloured.
The phone-frame SMS preview on Live call is the only other ruled
object, and it is a preview of a real artefact, not decoration.

## Accent

Blue, kept from round 9 — `oklch(0.545 0.215 262.7)` light,
`oklch(0.626 0.186 259.6)` dark. Reasoning: trust blue fits a clinic;
green would read as "go/healthy" and clash with the success semantic;
teal would fight the emerald success tone. Used for primary buttons,
active nav, links, the bar-chart fill, the "now" rule — under 10% of
any screen. The sentiment pie no longer uses indigo: it maps by name
(positive emerald, negative red, neutral slate), because sentiment has
exactly three values and the fourth colour was arbitrary.

## Tokens (OKLCH, hex in comments — same values as tokens.json)

Light: background `1 0 0` #ffffff · foreground `0.206 0.039 265.5`
#0f1729 · card `1 0 0` · primary `0.545 0.215 262.7` #2463eb ·
primary-foreground `0.984 0.003 247.9` #f8fafc · muted `0.968 0.007
247.9` #f1f5f9 · muted-foreground `0.556 0.040 256.8` #65758b ·
border `0.926 0.013 255.0` #e1e7ef · ring `0.545 0.215 262.7` ·
destructive `0.577 0.215 27.3` #dc2626.

Dark: background `0.167 0.026 265.9` #090e1a · foreground `0.984 0.003
247.9` · card `0.197 0.036 265.6` #0e1525 · primary `0.626 0.186
259.6` #3c83f6 · primary-foreground `0.206 0.039 265.5` · muted
`0.275 0.036 259.7` #1d283a · muted-foreground `0.710 0.035 256.8`
#94a3b8 · border `0.304 0.042 259.7` #222f44 · ring `0.626 0.186
259.6` · destructive `0.577 0.215 27.3` #dc2626.

Type: Satoshi 700 display / 400–500 text (self-hosted woff2, real
`tnum` — tabular figures everywhere); system mono stack for slot
times, call timestamps and phone numbers only. Radii 14/12/10px.
Elevation: two levels only (soft, lift). Motion: state changes only.

## Contrast table (computed from the final hex values; AA = 4.5:1)

| Pair | Light | Dark | Verdict |
|---|---|---|---|
| Foreground on background | 17.90:1 | 18.35:1 | AAA |
| Foreground on card | 17.90:1 | 17.43:1 | AAA |
| Foreground on muted | 16.31:1 | 14.16:1 | AAA |
| Primary-foreground on primary (button text) | 4.96:1 | 4.93:1 | AA |
| Muted-foreground on background (secondary text) | 4.72:1 | 7.47:1 | AA |
| Destructive-foreground on destructive | 4.62:1 | 4.62:1 | AA |
| Primary on background (links, "Next" label) | 5.20:1 | 5.30:1 | AA |

Destructive was `#ef4444` in round 9: white text on it was 3.61:1,
below AA. It is now `#dc2626` (4.62:1) in both modes. Semantic fills
(emerald/amber/red) are never small text on white: badges are -800
text on a -100 chip (light) and -300 on a -900/40 chip (dark);
StatCard icon chips are -600 light / -400 dark (icons are graphics,
3:1); chart fills are graphics, never text.

## What changed in 0.3.7 (design)

- Tokens moved from HSL to OKLCH with hex fallbacks
  (`frontend/src/index.css`, `frontend/tailwind.config.js`,
  `frontend/src/tokens.json`); destructive darkened to pass AA.
- Mono role: slot times, call timestamps and phone numbers are now
  `font-mono` (system stack) in Overview, Calls and Appointments.
- Sentiment pie maps colours by name; the indigo fourth colour is gone.
- Today's appointments: the next appointment today gets the 2px
  primary rule + `Next` label (computed in clinic time).
- The Live-call primary CTA lost `shadow-glow`; the `glow` shadow is
  removed from the theme — one shadow scale, no glow.
- StatCard icon chips gain dark-mode `-400` text shades (light `-600`
  was 3.19–3.77:1 on the dark card for amber/emerald).

## Slop checklist (playbook) — checked 22 Nov 2026

No purple-blue gradient, no gradient text/buttons, no glassmorphism,
no radial glows, no dot-pattern backgrounds, no 3-column feature
grid, no emoji/symbol decoration, no cliché copy (seamless /
supercharge / elevate / unlock / "AI-powered" headline), no default
font, no fake stats (every number comes from the real call log),
no dead buttons, no stock shadcn theme, no shimmer, no hover lifts,
no staggered entrances. Enforced in the build by
`tests/test_copy_guard.py` (emoji, banned words, backdrop-blur,
stagger, animate-ping).

## Unchanged by decision

- The Sunday-hours tension: the knowledge base says Sunday 10:00–14:00
  is "emergencies only" but the engine still generates ordinary
  bookable Sunday slots. Left exactly as it is — Siva's call.
- The three self-hosted Satoshi woff2 files stay linked locally; the
  remote copy falls back to system fonts (snapshot pushes are UTF-8
  only). Not removed, not re-hosted.
