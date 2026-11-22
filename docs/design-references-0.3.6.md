# Design references — Voice Receptionist v0.3.6 (playbook pass, 22 Nov 2026)

Inspiration sites (playbook step 1): **Mobbin**, **Page Flows**, **UI Sources**.
Type/palette decided before any component (step 2); built from restyled
primitives (step 3); motion only for state changes (step 5).

## References — one line each on what to borrow

1. **Mobbin — Linear issue screen (B2B/DevTool archetype).** Density without
   clutter, keyboard-first, high-contrast work area, subtle 1px borders;
   borrow the quiet sidebar + 8px spacing rhythm, not Linear's chrome.
2. **Mobbin — Stripe dashboard.** White canvas, midnight-slate text,
   restrained indigo accent, 8px spacing scale (4/8/12/16/24/32), radii
   8px buttons / 12px cards / 4px badges; borrow the stat-card shape
   (flat, 1px border, no lift) and the table spec below.
3. **Stripe design tokens (design-md/stripe.md).** Table header 12px
   semibold uppercase with tracking, rows px-5 py-3.5, hover is a flat
   background tint; amounts tabular-nums, right-aligned; badges are a
   light fill + dark ink + the word, never colour alone.
4. **Page Flows — Pipedrive onboarding (recorded flow).** Signup → setup
   questions → welcome → dashboard; borrow progressive disclosure: the
   dashboard shows the verdict first, detail one click deep.
5. **Page Flows — Help Scout onboarding (recorded flow).** Setup guide as
   a checklist, "Continue setup" returns to the exact next step, success
   is quiet; borrow the honest empty/error states that say what to do next.
6. **Typeyeah / Typewolf — Satoshi + Satoshi.** One family throughout
   (700 headings / 400 body), free via Fontshare; neo-grotesques are
   the current premium pick over geometric sans, and the 2–3 font
   ceiling means one font, one role — no second family for decoration.
   Verified against the downloaded files with fontTools: Satoshi ships
   a real `tnum` OpenType feature, so `tabular-nums` gives true
   tabular figures for stat values, times and prices (General Sans was
   tried first and rejected — proportional digits, no `tnum`).
7. **ZikZuk design language (after Stripe).** Colour only where it means
   something; sentence case everywhere, only table headers uppercase;
   1px hairlines separate rows, no elevation on the canvas; motion fast
   (hover/press instant, ≤100ms; panel transitions 160–200ms); toasts one line.
8. **Happy Hues (palettes in context).** Every palette is shown applied to
   a real layout with roles labelled (background / headline / button /
   accent); borrow the discipline: greys carry the page, one blue primary,
   semantic tones only for state (success/warning/danger).
9. **Linear 2026 refresh.** Dimmer sidebar, more compact tabs, softer
   borders; borrow the restrained sidebar (solid surface, no frost).
10. **Vercel dashboard.** One hideable sidebar, summary up top, logs one
    click deep; borrow the same disclosure rule for Calls (summary row →
    full transcript on click) and Appointments (list → day detail).

## Decisions for this dashboard

- **Type:** Satoshi (Fontshare), self-hosted woff2 in
  `frontend/src/assets/fonts/` — one family, weights 400/500/700;
  `font-variant-numeric: tabular-nums` (real `tnum` in the font, verified
  with fontTools) so every figure (stat values, times, prices) is tabular.
  Inter was the default stack with no character; General Sans was tried
  and rejected for proportional digits with no `tnum`.
- **Palette:** background white / ink `#0f172a`-range, one blue primary
  (221 83% 53%), semantic emerald/amber/red/violet only for state;
  dark theme keeps the same roles. No purple-blue gradient anywhere.
- **Icons:** Lucide only, one set, 16px in nav, 20px in stat cards.
- **Primitives:** shadcn/ui-style Button/Card/Badge/Skeleton/Toast,
  restyled — 0.875rem radius, custom tokens, solid surfaces (no
  `backdrop-blur`, no translucency on sidebar/topbar/toasts), flat
  stat cards with a 1px border and no hover lift.
- **Motion:** only state changes — new chat bubble, toast appearing,
  call timer, typing dots while the agent "types". No staggered
  entrances (no per-item `delay`), no shimmer, no breathing/ping dots,
  no hover lift on cards. The copy-guard test fails the build on
  `backdrop-blur` and staggered-entrance (`delay:`/`stagger`) patterns.
- **Layout:** 256px sidebar (bottom nav on mobile), max-w-6xl content,
  8px spacing rhythm, 4-stat row, 2:1 charts grid, data-first tables.
