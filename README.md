# Honeywell Valve & Actuator — Zoe POC

Client demo mockup for the Honeywell Valve & Actuator Zoe POC (per "Honeywell
Valves and Actuators POC Ask, August 2026"). Themed to Honeywell Building
Automation; host page replicates the real "Field Devices" category page
(`buildings.honeywell.com/us/en/products/by-category/building-management/
field-devices`).

## Run it

```
cd clients/honeywell-zoe
python3 -m http.server 8123
```

Open `http://localhost:8123/index.html`.

## What's here

- `index.html` — the host page (Honeywell's own markup, hand-built replica —
  see `config/brand.json` for why not a literal scrape) + the Zoe integration.
- `host.css` — host page styling only, not the Zoe experience layer.
- `themes/honeywell.css` — brand theme (token overrides only).
- `config/conversation.json` — the flow tree, **the file a designer would
  actually edit**. `index.html` carries an inlined mirror of the same content
  (see "Known limitations" — this duplication is a deliberate workaround, not
  an oversight).
- `config/honeywell-nlp.js` — vertical-specific free-text parsing, overriding
  the documented `window._routeFreeText()` / `window.applyZoeFilter()`
  extension points in `scripts/zoe-engine.js`.

## The demo script

1. Land on the Field Devices page. The black "Product Selector" promo banner
   has the classic dropdown + Configure Now path on the left, and a new CTA
   on the right: **"✦ Describe what you need here"**.
2. Click it. Zoe opens collapsed — header + composer only, no canned
   greeting, no suggestion chips. Placeholder reads "Tell us what you need."
3. Type (don't click a canned prompt — this is meant to be organic):
   > I need a pressure-independent control valve for a water/glycol system.
   > The required flow rate is approximately 5 GPM. I need a 4-inch
   > connection, a modulating actuator, 24V AC/DC power, a modulating
   > 2–10 VDC control signal, and a fail-in-place action.
4. Zoe echoes back what it recognized as a row of filter pills, then flags
   the one real inconsistency in the spec: a 4-inch PICV in this catalog is
   rated 55+ GPM, not 5 GPM. Offers to proceed with the correctly-sized
   3/4-inch body, or explains why if you push back ("show me the 4-inch
   option anyway").
5. Optional detour: click "What is a pressure-independent valve?" or "Why
   does connection size matter here?" — real explanations with a citation to
   the actual VRN spec sheet, then routes back to the same question.
6. Confirm the 3/4-inch valve. Zoe shows the interpreted-requirements
   checklist (stated vs. adjusted vs. inferred), then the recommendation:
   `VRN2BHPXD002` with real cited PDFs (DCA Specification Data, Product Data
   Sheet).
7. Refinement: click "What's the difference between fail-in-place and
   fail-safe closed?" for the explainer (cited to the real DCA Wiring
   Guide), then "Change it to fail-safe closed now" — Zoe swaps to
   `MS7505A2130/U`, same valve, same modulating 2–10 VDC signal, without
   restarting the conversation.
8. "Add to schedule" / "Export configuration summary" — both correctly
   reflect whichever actuator variant is currently active.

Reset between demos: the header's ↻ button restarts the conversation; reload
the page to reset the host page state too.

## Real citations used

All PDF/PDP links are genuine, verified this session by walking the actual
Honeywell selector and product pages (not fabricated):

- VRN Pressure Independent Control Valves — product family page + form
  62-3115 Specification Data (referenced by form number; the live PDP is
  geo-restricted from this session's network, so the exact PDF URL wasn't
  directly confirmed — the category page URL and form number are real).
- `MN6105/MN7505 44 lb-in. DCA Specification Data` (63-1313.pdf) and
  `MN6105/MN6110 Non-Spring Return DCA Product Data` (63-2632.pdf) — fetched
  from `prod-edam.honeywell.com`, Honeywell's real literature CDN.
- `MSxx03/MSxx05 Spring Return DCAs Specification Data` (63-1336.pdf) and
  `Direct Coupled Actuator (DCA) Wiring Guide` (63-2622.pdf) — same CDN.

## UI revision (second pass)

Per follow-up designer feedback, on top of everything above:

- **No floating FAB, ever.** The widget's collapsed state is a persistent
  bottom-center docked bar (header + composer only, `.hw-docked` class —
  see "Known limitations" below for why this is bespoke). Clicking the
  header, focusing the input, or the banner CTA all expand it; a new
  expand/minimize chevron pair in the header toggles explicitly.
- Conversation body padding: `32px 8px 8px` (top/sides/bottom), overriding
  `.is-wedge`'s canonical zero-padding assumption.
- User bubble + send button recolored to `#0071B3` via the dedicated
  `--zoe-bubble-user-bg` token (bubble) and a scoped `.zoe-send` override
  (no dedicated token exists for the button yet — filed as a gap).
- Bot responses now bold the terms Zoe derived from user input and other
  spec-critical keywords (`<b>` — already styled by the canonical
  `.zoe-msg.bot .bub b` rule, no CSS added).
- The "recognized as filters" pill row is now part of the SAME message as
  the confirmation sentence, not a separate bubble.
- Citations are no longer their own bubble: they render as a footer inside
  the same bubble/card (small top border + 12px link), both in educational
  answers and on recommendation cards.
- "Add to Cart" (the canonical rec-card button) is intercepted in the
  capture phase and opens an **"Added to cart" modal** instead of the
  default close-and-navigate-to-pdp behavior. **This modal's design is
  provisional** — the requested reference screenshot didn't come through
  in that message; happy to match it exactly once shared.
- Conversation body confirmed scrollable (`overflow-y: auto` — `.is-wedge`'s
  canonical rule sets `overflow: hidden` assuming the AI Companion engine
  owns scrolling internally, which doesn't apply here; overridden per-theme).

## Modals (all bespoke — no canonical modal component in the manifest)

Three overlays, all carrying a shared `hw-modal` class:

- **Sign-in gate** — "Add to cart" (rec card or details modal) opens
  "Purchasing Configured Product / …please sign in to your account" with a
  primary **Log in** CTA. Replaces the canonical rec-card default
  (`closeZoe()` + `navigateTo('pdp')`).
- **Product details** — "View details" opens a preview reusing the card's
  own image / badge / name / price / rationale (including its citation
  footer), plus three actions: **Add to cart** (primary), Add to schedule,
  Export configuration summary.
- **Download gate** — "Export configuration summary" (chip or details
  modal) opens a replica of Honeywell's own literature-download form
  (name / email / phone / company / role / region / job title, areas of
  interest, further details, marketing consent, "How do you work with
  Honeywell?"). No validation, by design. Submitting continues the flow to
  the matching `handoff_export` node so the summary lands in the chat.

Schedule/export routing reads `window.__hwReq.fail_safe` so it picks the
fail-safe-closed variant when that refinement is active.

**Bug fixed this round:** closing any modal used to collapse the chat
behind it. `zoe-engine.js` binds a capture-phase document `mousedown` that
calls `window.minimizeZoe()` for any click outside the panel — and the
modals mount on `<body>`, so they counted as "outside". Listener
registration order means a capture-phase listener of ours can't pre-empt
the engine's, so the guard lives in the thunk the engine actually calls
(`modalOpen()`). The header minimize button bypasses it by calling
`showDocked()` directly.

## Product photos

`assets/img/` — drop `valve.png` and `actuator.png` there and they appear
in both the chat cards and the details modal; `window.__IMAGE_MAP__` in
`index.html` is already wired for those filenames. Missing files fall back
to the canonical placeholder via the engine's own `onerror` handler, so
nothing breaks in the meantime. See `assets/img/README.md`.

## Editing the conversation

`config/conversation.json` is the source of truth. `index.html` carries a
synchronous inline mirror (required — see the comment above the
assignment). After editing the JSON, run:

```
python3 sync-inline-conversation.py
```

Hand-splicing the mirror caused duplicated-brace syntax errors three times
this session; the script exists so that can't happen again.

## Known limitations

- **Sticky is a restyle, not the full AI Companion engine — now with a
  bespoke docked/expand implementation.** The panel keeps the plain Zoe
  chat engine (already built + verified) with `.is-wedge`/`.is-sticky`
  position/width modifiers rather than switching to the canonical AI
  Companion sticky loader. The canonical 3-state docked-bar collapse is
  CSS-scoped to `.aic-panel__body`, which this panel doesn't have, so a
  project-local `.hw-docked` class + `window.openZoe/closeZoe/minimizeZoe/
  expandZoe` overrides (in `index.html`, following the engine's own
  documented late-binding override pattern) implement the equivalent
  collapse/expand behavior directly. Functionally equivalent to what the
  designer asked for; visually/structurally bespoke, not canonical — a
  reasonable candidate to promote into `zoe-widget.css` as a real
  `.is-sticky.docked` rule for the plain chat engine, not just AI
  Companion's.
- **`window.__ZOE_FLOW__` closure-capture race (library bug, not patched
  here).** `scripts/zoe-engine.js` line 326 captures `window.__ZOE_FLOW__`
  into a closure synchronously at script-load time. Any later *reassignment*
  of `window.__ZOE_FLOW__` (e.g. the loader's own `data-data` fetch) breaks
  the shared reference, so subsequent mutations (like this project's
  dynamically-injected nodes) silently stop reaching the running engine.
  Worked around here by (a) using `window.__INLINED_CONVERSATION__`
  (`zoe-data.js`'s own documented synchronous escape hatch) instead of
  `data-data`, and (b) dropping the `data-data` attribute entirely so
  nothing reassigns `__ZOE_FLOW__` after the engine boots. Filed as a
  candidate CONTRIBUTE-mode fix, not patched in the canonical file.
- **`data-brand-name` / `data-context-label` don't do anything.** Despite
  appearing in the manifest's documented `supported_data_attrs`, grepping
  `embed/zoe/loader.js` confirms neither is read. Header copy and the
  context label are instead set via `conversation.json`'s `ctxLabels` /
  `assistantName` fields (which do work) plus a small text-override script.
- **Educational side-branch "continue" always returns to the scripted
  canonical node.** For genuinely off-script free-text input, the
  `edu_picv` / `edu_connection_size` explainers still route back to
  `scenario_demo_intake` rather than the dynamically-generated conflict
  text. Cosmetic only — the user can just retype.
- The valve family PDP itself (`vrn-pressure-independent-control-valves-and-
  actuators`) returned "not available in your country" for this session's
  network (geo-restricted to a subset of countries that excludes wherever
  this ran from) — confirmed the URL and product family are real via the
  in-app product links, but couldn't screenshot that specific page.
