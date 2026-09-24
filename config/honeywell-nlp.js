/* =====================================================================
   honeywell-nlp.js — vertical-specific free-text routing for the Zoe
   Valve & Actuator POC.

   Overrides window._routeFreeText() and window.applyZoeFilter(), the two
   documented extension points in scripts/zoe-engine.js, per the engine's
   own guidance:
     "Free-text input → keyword-routed step. Override window._routeFreeText()
      in your project script for vertical-specific keywords."

   Recognizes the vocabulary listed in the POC brief's functional
   requirements §1 (water/glycol, steam, pressure independent/dependent,
   2-way/3-way diverting/3-way mixing/6-way, on/off, modulating,
   fail-in-place, fail-safe closed, 24V AC/DC, 2-10 VDC, GPM), merges
   extracted values into window.__hwReq across turns (so Zoe never
   re-asks for something already given), flags the catalog-verified
   4-inch / 5-GPM PICV size conflict, and falls back to a generic
   catalog-tier lookup for any flow rate the demo scenario didn't cover.

   The scripted "scenario_demo_intake" -> "summary" path in
   conversation.json stays exact for the agreed demo scenario (POC brief
   §"Proposed Demo Scenario"). This file handles everything typed live
   that deviates from it, so the POC also satisfies "support both
   complete and partial requests" rather than only the golden path.
   ===================================================================== */

(function () {
  'use strict';

  var REQUIRED = ['application', 'medium', 'flow_rate', 'connection_size', 'actuator_type', 'supply_voltage', 'control_signal', 'fail_safe'];

  var LABELS = {
    application: 'application type (pressure-independent or pressure-dependent)',
    medium: 'medium (water/glycol or steam)',
    flow_rate: 'flow rate',
    connection_size: 'connection size',
    actuator_type: 'actuator control type (modulating or on/off)',
    supply_voltage: 'actuator supply voltage',
    control_signal: 'actuator control signal',
    fail_safe: 'fail-safe action'
  };

  /* Catalog tiers actually observed in the live Product Selector this
     session (VRN2B PICV family, 2-way). Used only for the dynamic /
     off-script path — the canonical demo scenario uses the exact,
     fully-verified 0.75in / 0-6 GPM / VRN2BHPXD002 match instead. */
  var CATALOG_TIERS = [
    { size: 0.75, maxGpm: 6,  label: '3/4 in', skuFamily: 'VRN2B006.00PX', verified: true },
    { size: 2,    maxGpm: 75, label: '2 in',    skuFamily: 'VRN2B (2 in tier)', verified: false },
    { size: 2.5,  maxGpm: 95, label: '2.5 in',  skuFamily: 'VRN2B (2.5 in tier)', verified: false },
    { size: 3,    maxGpm: 95, label: '3 in',    skuFamily: 'VRN2B (3 in tier)', verified: false },
    { size: 4,    maxGpm: 999,label: '4 in',    skuFamily: 'VRN2B (4 in tier, 55+ GPM)', verified: false }
  ];

  function nearestTier(flowRate) {
    for (var i = 0; i < CATALOG_TIERS.length; i++) {
      if (flowRate <= CATALOG_TIERS[i].maxGpm) return CATALOG_TIERS[i];
    }
    return CATALOG_TIERS[CATALOG_TIERS.length - 1];
  }

  function extract(text) {
    var t = ' ' + text.toLowerCase() + ' ';
    var out = {};

    if (/pressure[\s-]?independent/.test(t)) out.application = 'Pressure independent';
    else if (/pressure[\s-]?dependent/.test(t)) out.application = 'Pressure dependent';

    if (/water\s*\/?\s*glycol|glycol/.test(t)) out.medium = 'Water/glycol';
    else if (/\bsteam\b/.test(t)) out.medium = 'Steam';

    var flowMatch = t.match(/(\d+(\.\d+)?)\s*(gpm|gallons? per minute)/);
    if (flowMatch) out.flow_rate = parseFloat(flowMatch[1]);

    var sizeMatch = t.match(/(\d+(\.\d+)?)\s*[\-\s]?(inch|in\.?|")\b/);
    if (sizeMatch) out.connection_size = parseFloat(sizeMatch[1]);

    if (/6[\s-]?way/.test(t)) out.valve_pattern = '6-way';
    else if (/3[\s-]?way\s*divert/.test(t)) out.valve_pattern = '3-way diverting';
    else if (/3[\s-]?way\s*mix/.test(t)) out.valve_pattern = '3-way mixing';
    else if (/2[\s-]?way/.test(t)) out.valve_pattern = '2-way';

    if (/\bmodulating\b/.test(t)) { out.control_type = 'Modulating'; out.actuator_type = 'Modulating actuator'; }
    else if (/on\s*\/\s*off|on-off/.test(t)) { out.control_type = 'On/off'; out.actuator_type = 'On/off actuator'; }

    if (/24\s*v(olt)?\s*ac\s*\/?\s*dc/.test(t)) out.supply_voltage = '24V AC/DC';
    else if (/24\s*v(olt)?\s*ac\b/.test(t)) out.supply_voltage = '24V AC';

    if (/2\s*[\-–]\s*10\s*v\s*dc|2\s*to\s*10\s*vdc/.test(t)) out.control_signal = 'Modulating 2–10 VDC';
    else if (/0\s*[\-–]\s*10\s*v\s*dc/.test(t)) out.control_signal = 'Modulating 0–10 VDC';
    else if (/floating/.test(t)) out.control_signal = 'Floating';

    if (/fail[\s-]?in[\s-]?place/.test(t)) out.fail_safe = 'Fail-in-place';
    else if (/fail[\s-]?safe\s*closed|fail[\s-]?safe\s*close\b/.test(t)) out.fail_safe = 'Fail-safe closed';
    else if (/fail[\s-]?safe\s*open/.test(t)) out.fail_safe = 'Fail-safe open';

    return out;
  }

  function missingFields(req) {
    return REQUIRED.filter(function (k) { return req[k] == null || req[k] === ''; });
  }

  function isPicv(req) {
    return String(req.application || '').toLowerCase().indexOf('pressure independent') !== -1;
  }

  function sizeFlowConflict(req) {
    if (req.connection_size == null || req.flow_rate == null || !isPicv(req)) return false;
    return req.connection_size >= 2 && req.flow_rate < 20;
  }

  function isCanonicalDemoScenario(req) {
    return isPicv(req) &&
      req.medium === 'Water/glycol' &&
      req.flow_rate >= 3 && req.flow_rate <= 8 &&
      req.connection_size === 4 &&
      req.control_type === 'Modulating' &&
      req.supply_voltage === '24V AC/DC' &&
      req.control_signal === 'Modulating 2–10 VDC' &&
      req.fail_safe === 'Fail-in-place';
  }

  function summarizeLine(req) {
    var parts = [];
    if (req.application) parts.push(req.application.toLowerCase());
    if (req.medium) parts.push(req.medium.toLowerCase());
    if (req.flow_rate != null) parts.push('~' + req.flow_rate + ' GPM');
    if (req.connection_size != null) parts.push(req.connection_size + '-inch connection');
    if (req.actuator_type) parts.push(req.actuator_type.toLowerCase());
    if (req.supply_voltage) parts.push(req.supply_voltage);
    if (req.control_signal) parts.push(req.control_signal.toLowerCase());
    if (req.fail_safe) parts.push(req.fail_safe.toLowerCase());
    return parts.join(', ');
  }

  function injectClarifyNode(missing) {
    window.__ZOE_FLOW__['clarify_dynamic'] = {
      bot: [
        "I've got some of this, but I still need: " + missing.map(function (k) { return LABELS[k]; }).join(', ') + '.',
        'You can give me the rest in one message, or answer one at a time.'
      ],
      chips: [
        { label: 'What information do I need to provide?', next: 'edu_overview' },
        { label: 'See the full example instead', next: 'scenario_demo_intake' }
      ]
    };
    return 'clarify_dynamic';
  }

  function injectConflictNode(req) {
    var tier = nearestTier(req.flow_rate);
    window.__ZOE_FLOW__['conflict_dynamic'] = {
      bot: [
        'Got it — here’s what I heard: ' + summarizeLine(req) + '.',
        'One thing doesn’t line up: in this catalog, ' + req.connection_size + '-inch pressure-independent valves are built for much higher flow than ' + req.flow_rate + ' GPM — that size isn’t engineered for this flow rate. The ' + tier.label + ' body is the one sized correctly for it.',
        'Want me to proceed with the ' + tier.label + ' valve instead?'
      ],
      chips: [
        { label: 'Yes, use the ' + tier.label + ' valve', next: 'summary_dynamic' },
        { label: 'No — re-check the flow rate', next: 'ask_flow_rate', state: { _conflictPending: true } },
        { label: 'What is a pressure-independent valve?', next: 'edu_picv' },
        { label: 'Why does connection size matter here?', next: 'edu_connection_size' }
      ]
    };
    req._conflictPending = true;
    return 'conflict_dynamic';
  }

  function injectDynamicSummary(req) {
    var tier = nearestTier(req.flow_rate);
    var lines = [
      "Here's what I've captured before I pull the match:",
      [
        req.application ? '✓ Application: ' + req.application.toLowerCase() + ' (stated)' : '',
        req.medium ? '✓ Medium: ' + req.medium.toLowerCase() + ' (stated)' : '',
        req.flow_rate != null ? '✓ Flow rate: ~' + req.flow_rate + ' GPM (stated)' : '',
        req.connection_size != null
          ? (tier.size === req.connection_size
              ? '✓ Connection size: ' + tier.label + ' (stated)'
              : '≈ Connection size: ' + tier.label + ' (adjusted from your ' + req.connection_size + ' in — see above)')
          : '',
        req.actuator_type ? '✓ Actuator type: ' + req.actuator_type.toLowerCase() + ' (stated)' : '',
        req.supply_voltage ? '✓ Supply voltage: ' + req.supply_voltage + ' (stated)' : '',
        req.control_signal ? '✓ Control signal: ' + req.control_signal.toLowerCase() + ' (stated)' : '',
        req.fail_safe ? '✓ Fail-safe action: ' + req.fail_safe.toLowerCase() + ' (stated)' : '',
        '≈ Valve pattern: 2-way (inferred — the only pattern this application and medium combination supports)'
      ].filter(Boolean).join('<br>'),
      'Pulling the matching combination…'
    ];

    var node;
    if (tier.verified) {
      node = {
        bot: lines,
        rec: {
          name: 'VRN2BHPXD002 — VRN2B006.00PX + MN7505A2209+3R',
          match: 'Exact spec match',
          price: 'In stock · typical lead time 3–5 business days',
          why: 'Matches ' + summarizeLine(req) + ' exactly.<br><br><b>Valve</b> VRN2B006.00PX — 2-way, 3/4 in FNPT, 0–6 GPM, plated brass trim, 250°F max, 360 psi rated.<b>Actuator</b> MN7505A2209+3R — non-spring return, modulating 2–10 Vdc, 24 Vac, fail-in-place, 2x aux switch, NEMA 3R enclosure.',
          imageKey: 'valve'
        },
        chips: [
          { label: 'Change the actuator to fail-safe closed', next: 'refine_failsafe_closed' },
          { label: 'Add to schedule', next: 'handoff_schedule' }
        ]
      };
    } else {
      /* Off-catalog-sample flow rate — be honest rather than inventing an
         exact SKU for a tier we didn't fully capture this session. */
      node = {
        bot: lines.concat([
          'The closest verified size tier for ' + req.flow_rate + ' GPM is the <b>' + tier.label + '</b> pressure-independent body (' + tier.skuFamily + '). I can confirm the exact trim, pressure rating, and part number the same way I did for the 3/4-inch tier — want me to pull that detail, or add this tier to your schedule as-is for your team to confirm?'
        ]),
        chips: [
          { label: 'Add to schedule as-is', next: 'handoff_schedule' },
          { label: 'Start over with the verified example', next: 'scenario_demo_intake' }
        ]
      };
    }
    window.__ZOE_FLOW__['summary_dynamic'] = node;
    return 'summary_dynamic';
  }

  /* =====================================================================
     Scenario 2 — symptom-led "factory buyer" dialogue.

     Same entry point as Scenario 1 (the single organic input field); which
     script runs is decided purely by what the opening message looks like.
     Scenario 1's opening is spec-dense (matches the vocabulary extract()
     already understands); Scenario 2's has none of that — a process
     symptom and a goal instead. isScenario2Opening() distinguishes them so
     this never fires on Scenario 1's input.

     Unlike Scenario 1, each step here is a guided question with its own
     suggested-prompt chip AND organic free-text parsing. The engine has no
     "current step" API (window.__ZOE_LAST_STEP__ is referenced by the
     zoe-data.js advisor singleton but never actually set anywhere — a
     library gap, not something to route around by patching the engine),
     so lastBotText() reads the most recent bot bubble already in the DOM
     to infer which question is being answered. Reliable for a scripted
     demo: each s2_* node's copy is unique and known in advance.
     ===================================================================== */

  function lastBotText() {
    var bubs = document.querySelectorAll('#zoeMockBody .zoe-msg.bot .bub');
    return bubs.length ? (bubs[bubs.length - 1].textContent || '') : '';
  }

  function isScenario2Opening(text) {
    var lo = text.toLowerCase();
    var hasLoop = /cooling\s*(loop|system)/.test(lo);
    var hasManual = /manual(ly)?|walk(ing)?\s*around/.test(lo);
    var hasSelfAdjust = /self[\s-]?adjust|inconsistent|on its own|without (anyone|someone)/.test(lo);
    return hasLoop && (hasManual || hasSelfAdjust);
  }

  /* Doc's refinement line ("Our safety team ... rather it close completely
     if it ever loses power") shares no vocabulary with Scenario 1's
     "fail-safe closed" trigger, so it needs its own check — gated to
     scenario 2 so it can't misfire on Scenario 1 conversations. */
  function isScenario2FailsafeConcern(text) {
    var lo = text.toLowerCase();
    return /safety/.test(lo) && /close\s*completely|closes\s*completely|fully\s*closed|shut\s*(it\s*)?completely/.test(lo);
  }

  /* v1.2 — SKU comparison mode. Free text at the fail-safe question that
     expresses genuine uncertainty (not a preference the two chips already
     cover) routes to the two-SKU comparison flow instead of defaulting to
     fail-in-place. Scoped by the caller to the s2_ask_failsafe step via
     lastBotText(), so it can't misfire elsewhere in the conversation. */
  function isScenario2FailsafeUncertain(lo) {
    return /not sure|don'?t know|no idea|unsure|not certain|no preference|either (one|is fine|works)/.test(lo);
  }

  function routeScenario2(text) {
    var lo = text.toLowerCase();
    var last = lastBotText().toLowerCase();
    var req = window.__hwReq;
    req.scenario = 2;

    if (last.indexOf('plain water, or a') !== -1) {
      req.medium = /glycol/.test(lo) ? 'Water/glycol' : 'Water';
      return 's2_ask_flow';
    }
    if (last.indexOf('gallons per minute') !== -1) {
      var gpm = lo.match(/(\d+(\.\d+)?)\s*gpm/);
      if (gpm) req.flow_rate = parseFloat(gpm[1]);
      if (/4[\s-]?inch/.test(lo)) req.connection_size = 4;
      return 's2_flow_size_flag';
    }
    if (last.indexOf('does that work for your installation') !== -1) {
      req.flow_rate = req.flow_rate || 5;
      req.connection_size = 0.75;
      return 's2_ask_control_type';
    }
    if (last.indexOf('just confirming that') !== -1) {
      req.control_type = 'Modulating';
      req.actuator_type = 'Modulating actuator';
      return 's2_pitch_picv';
    }
    if (last.indexOf('include that in the recommendation') !== -1) {
      req.application = 'Pressure independent';
      return 's2_ask_signal';
    }
    if (last.indexOf('confirm it during install') !== -1) {
      req.supply_voltage = '24V AC/DC';
      req.control_signal = 'Modulating 2–10 VDC';
      return 's2_ask_failsafe';
    }
    if (last.indexOf('avoids an abrupt process upset') !== -1) {
      /* v1.2 — SKU comparison mode. The two fail-safe chips at this step
         cover a clear pick; free text ("I'm not sure which one I need")
         is the uncertainty case the chips can't express, so it gets its
         own branch instead of silently defaulting to fail-in-place. */
      if (isScenario2FailsafeUncertain(lo)) return 's2_failsafe_uncertain';
      req.fail_safe = 'Fail-in-place';
      return 's2_summary';
    }
    /* Opening message, or anything unrecognized mid-flow — start (or
       restart) the guided question sequence rather than falling through
       to Scenario 1's clarify_generic, which assumes spec vocabulary. */
    return 's2_ask_medium';
  }

  window.applyZoeFilter = function (state) {
    window.__hwReq = window.__hwReq || {};
    Object.keys(state || {}).forEach(function (k) { window.__hwReq[k] = state[k]; });
  };

  window._routeFreeText = function (text) {
    window.__hwReq = window.__hwReq || {};
    var lo = text.toLowerCase();

    if (window.__hwReq.scenario === 2 && isScenario2FailsafeConcern(text)) {
      return 's2_refine_failsafe_prompt';
    }

    /* Mid-conversation refinement — works from any state once a recommendation exists. */
    if (/fail[\s-]?safe\s*closed/.test(lo) && window.__hwReq.flow_rate != null) {
      window.__hwReq.fail_safe = 'Fail-safe closed';
      return 'refine_failsafe_closed';
    }

    if (window.__hwReq.scenario === 2) return routeScenario2(text);
    if (isScenario2Opening(text)) { window.__hwReq.scenario = 2; return 's2_ask_medium'; }

    /* Resolving a previously-asked flow-rate re-entry (see conflict nodes' state chip). */
    if (window.__hwReq._conflictPending) {
      var m = lo.match(/(\d+(\.\d+)?)/);
      if (m) {
        window.__hwReq._conflictPending = false;
        window.__hwReq.flow_rate = parseFloat(m[1]);
        if (sizeFlowConflict(window.__hwReq)) return injectConflictNode(window.__hwReq);
        return isCanonicalDemoScenario(window.__hwReq) ? 'summary' : injectDynamicSummary(window.__hwReq);
      }
      return 'ask_flow_rate';
    }

    var extracted = extract(text);
    Object.keys(extracted).forEach(function (k) { window.__hwReq[k] = extracted[k]; });

    var missing = missingFields(window.__hwReq);
    if (missing.length >= 6) return 'clarify_generic';
    if (missing.length > 0) return injectClarifyNode(missing);
    /* Canonical demo scenario checked BEFORE the generic conflict injector —
       the scripted "scenario_demo_intake" node already covers this exact
       conflict with the recognized-filters pill display; the dynamic
       injector is the fallback for conflicts the scripted copy doesn't cover. */
    if (isCanonicalDemoScenario(window.__hwReq)) return 'scenario_demo_intake';
    if (sizeFlowConflict(window.__hwReq)) return injectConflictNode(window.__hwReq);
    return injectDynamicSummary(window.__hwReq);
  };
})();
