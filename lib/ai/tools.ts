import type { OpsSnapshot } from "./opsSnapshot";
import { searchKnowledge } from "./systemKnowledge";

/** Ollama/OpenAI-style function-calling tool schemas. Kept deliberately small — five tools,
 * each returning a targeted slice of the snapshot rather than the model ever seeing the full
 * thing, both because llama3.1:8b's practical context window is small on this hardware and
 * because a targeted result is what actually keeps an answer grounded instead of inviting the
 * model to browse-and-summarize a wall of JSON. list_planned_actions exists specifically for
 * indirect "what have we planned/queued/doing about X" questions — the model previously had
 * no way to answer these accurately since pending recommendations weren't exposed as a tool
 * at all, only as a bare count inside get_resort_summary. */
export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "find_room",
      description: "Look up a specific room or guest by room number or guest name. Use this for 'who is in room X' or 'which room is <guest> in'.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "A room number (e.g. '204') or a guest name (full or partial)." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_open_issues",
      description: "List every currently open service request and unresolved alert across the resort — use this for 'what problems are there', 'what needs attention', 'any SLA breaches'.",
      parameters: {
        type: "object",
        properties: { onlyBreached: { type: "boolean", description: "If true, only include requests that have already breached their SLA." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_guests",
      description: "List in-house guests, optionally filtered — use this for 'who are our VIPs', 'which guests are unhappy', 'list platinum members'.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["all", "vip", "unhappy", "platinum", "gold", "silver"], description: "'unhappy' means sentiment below -0.2." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_planned_actions",
      description:
        "List pending AI recommendations/planned actions not yet approved by staff — maintenance work orders, staffing calls, pricing changes, inventory reorders, and guest-specific next-best-action offers. Use this for 'what have we planned for X', 'what's queued', 'what are we doing about Y', or any question about upcoming/planned/pending actions rather than the current state.",
      parameters: {
        type: "object",
        properties: {
          vipOnly: { type: "boolean", description: "If true, only include actions planned for VIP guests." },
          guestName: { type: "string", description: "If given, only include actions planned for this specific guest (full or partial name)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_resort_summary",
      description: "Get resort-wide KPIs — occupancy, ADR, RevPAR, guest satisfaction, revenue today. Use this for any high-level 'how is the resort doing' question.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financials",
      description:
        "Financial picture: occupancy, ADR, RevPAR, TRevPAR, revenue today, ancillary (F&B/spa) revenue, direct-booking share, OTA commission avoided, energy cost/savings, plus the pricing engine's current vs recommended rate, projected RevPAR and elasticity. Use for ANY money question: revenue, pricing, RevPAR uplift, commission, 'how much', 'what if we raise rates', profit-style reasoning.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather_outlook",
      description:
        "7-day forecast (live Open-Meteo or simulated fallback) and what each day's weather does to demand: F&B spend multiplier, in-room presence, per-zone demand multipliers (pool deck, restaurant, spa...). Use for 'will it rain', 'weather this week', 'how does the forecast affect us', 'should we move the pool event indoors'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather_whatif",
      description:
        "Monte Carlo what-if: modeled effect of a rain day and a heatwave day versus a clear day over the next 8 hours, as P10/P50/P90 bands for occupancy, F&B demand, energy, unmet staffing, HVAC risk and open F&B/concierge requests. Use for 'what if a storm hits', 'impact of heavy rain / heatwave on operations', 'how should we prepare'.",
      parameters: { type: "object", properties: { scenario: { type: "string", enum: ["rain", "heatwave", "both"], description: "Which scenario to return; default both." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_public_signals",
      description:
        "Live external signals: public weather-concern score (0-1), which of the 7 sources (NewsAPI, GNews, Reddit, Bluesky, Mastodon, GDACS, Google Trends) are live, official hazard events (cyclones, floods) and recent headlines. Use for 'any alerts in the region', 'what is the news saying', 'is a cyclone coming', 'public sentiment about weather'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_asset_risk",
      description:
        "Predictive-maintenance view: assets ranked by probability of failing within 7 days, remaining useful life in days and health. Use for 'which equipment is about to fail', 'chiller risk', 'what should engineering service first', 'cost of a breakdown'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "Exact arithmetic. ALWAYS use this for any calculation (percentages, revenue deltas, ROI, break-even, cost comparisons) instead of computing in your head. Supports + - * / ^ ( ) % and sqrt(). Example: '(1200*0.65) - (1200*0.65*0.2)'.",
      parameters: { type: "object", properties: { expression: { type: "string", description: "The arithmetic expression, numbers only (no units or currency symbols)." } }, required: ["expression"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "How the SYSTEM works: module methods and formulas (Weibull, elasticity, EOQ, k-means), weather twin, Monte Carlo what-if, CCTV detection, autopilot, guest-app bridge, every integrated API and its use case, AI/LLM stack, security, real-vs-simulated scope, business-impact benchmarks. Use for 'how does X work', 'which APIs', 'what is the math behind', 'is this real'.",
      parameters: { type: "object", properties: { query: { type: "string", description: "The topic or question to look up." } }, required: ["query"] },
    },
  },
] as const;

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** The live sim's own numbers (sentiment, maintenance risk, recommendation confidence) are
 * full-precision floats like 0.8233020963248183 — fine for computation, unreadable in a table
 * a guest-facing or staff-facing chat renders verbatim. Verified live: the model faithfully
 * copied one straight into a Markdown table cell rather than rounding it, because nothing
 * upstream ever did. Rounding at the tool boundary (once, here) means every caller — the model,
 * any future tool — only ever sees the same clean number the rest of this app's UI already
 * shows, instead of relying on a prompt instruction to clean up a formatting problem that's
 * cheaper and more reliable to fix at the source. */
const pct = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Small recursive-descent evaluator (no eval): numbers, + - * / ^, unary minus, parentheses,
 * postfix %, sqrt(). Lets the assistant show exact arithmetic instead of guessing it. */
export function safeCalculate(raw: string): { ok: true; result: number } | { ok: false; error: string } {
  const src = raw.replace(/[,₹$\s]/g, "").replace(/×|x(?=[\d(])/gi, "*").replace(/÷/g, "/").replace(/−/g, "-");
  let i = 0;
  const peek = () => src[i];
  function num(): number {
    if (src.startsWith("sqrt(", i)) {
      i += 5;
      const v = expr();
      if (peek() !== ")") throw new Error("missing )");
      i++;
      if (v < 0) throw new Error("sqrt of negative");
      return Math.sqrt(v);
    }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("missing )");
      i++;
      return v;
    }
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) throw new Error(`unexpected "${peek() ?? "end"}"`);
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function post(): number {
    let v = num();
    while (peek() === "%") {
      i++;
      v /= 100;
    }
    return v;
  }
  function unary(): number {
    if (peek() === "-") {
      i++;
      return -unary();
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return post();
  }
  function pow(): number {
    const b = unary();
    if (peek() === "^") {
      i++;
      return Math.pow(b, pow());
    }
    return b;
  }
  function term(): number {
    let v = pow();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = pow();
      if (op === "/" && r === 0) throw new Error("division by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    if (!src) return { ok: false, error: "empty expression" };
    const v = expr();
    if (i < src.length) throw new Error(`unexpected "${src[i]}"`);
    if (!Number.isFinite(v)) throw new Error("not finite");
    return { ok: true, result: v };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Cheap, deterministic hints appended to the system prompt so a small local model reliably reaches
 * for the right tool on indirect questions instead of answering from memory. */
export function suggestTools(message: string): string[] {
  const m = message.toLowerCase();
  const out: string[] = [];
  const has = (re: RegExp) => re.test(m);
  if (has(/\b(revenue|revpar|trevpar|adr|price|pricing|rate|rates|commission|ota|profit|roi|cost|saving|savings|uplift|worth|money|rupee|lakh|crore|margin|break.?even|financ)/) || m.includes("₹")) out.push("get_financials");
  if (has(/\b(weather|rain|storm|monsoon|heat|hot|forecast|cyclone|flood|umbrella|indoor|outdoor|pool)/)) out.push("get_weather_outlook");
  if (has(/\b(what.?if|scenario|prepare|preparation|impact|storm|cyclone|heatwave|heavy rain|simulate|counterfactual)/)) out.push("get_weather_whatif");
  if (has(/\b(news|social|reddit|signal|alert|hazard|cyclone|flood|gdacs|public|region|advisory|trend)/)) out.push("get_public_signals");
  if (has(/\b(maintenance|equipment|chiller|ahu|elevator|boiler|pump|generator|fail|failure|breakdown|asset|servic|engineering)/)) out.push("get_asset_risk");
  if (has(/\b(how does|how do|how is|explain|why|formula|math|algorithm|apis?|integrat|architecture|tech stack|real or|simulated|cctv|camera|fire|autopilot|telegram|bridge|nugen|ollama|llm|privacy|security|method|logic)/)) out.push("search_knowledge");
  if (has(/\d/) && has(/\b(if|percent|increase|decrease|raise|cut|drop|by|per|total|multiply|times|compare|versus|vs|calculate|how much)/)) out.push("calculate");
  if (m.includes("%") && /\d/.test(m)) out.push("calculate");
  return [...new Set(out)];
}

/** Exact ₹ arithmetic for every percentage mentioned in the question, against each measured revenue
 * base, so a small model can quote verified numbers instead of doing sums itself. */
export function precomputeMoney(message: string, snapshot: OpsSnapshot): string | null {
  const pcts = [...message.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => parseFloat(m[1])).filter((n) => n > 0 && n <= 1000);
  if (!pcts.length) return null;
  const f = snapshot.financials;
  const bases: [string, number][] = [
    ["full-day room revenue run-rate (ADR x occupied rooms)", snapshot.kpis.adr * f.occupiedRooms],
    ["room revenue so far today", snapshot.kpis.revenueToday],
    ["F&B/spa/other (ancillary) revenue so far today", f.ancillaryRevenueToday + f.organicAncillaryToday],
    ["total revenue so far today", f.trevpar * f.totalRooms],
    ["energy cost so far today", f.energyToday],
  ];
  const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
  const lines = [...new Set(pcts)].slice(0, 3).flatMap((p) => bases.map(([label, v]) => `${p}% of ${label} (${inr(v)}) = ${inr((v * p) / 100)}; after a ${p}% cut = ${inr(v * (1 - p / 100))}; after a ${p}% rise = ${inr(v * (1 + p / 100))}`));
  return lines.join("\n");
}

/** Executes one tool call against the snapshot, returns a small JSON-serializable result —
 * pure and synchronous, no I/O, fully unit-testable without touching Ollama at all. An
 * unrecognized tool name returns an error object rather than throwing, since the caller feeds
 * this straight back to the model as a "tool" message either way. */
export function executeTool(call: ToolCall, snapshot: OpsSnapshot): unknown {
  switch (call.name) {
    case "find_room": {
      const query = String(call.arguments.query ?? "").trim().toLowerCase();
      if (!query) return { error: "no query provided" };
      const matches = snapshot.rooms.filter((r) => r.number.toLowerCase() === query || r.number.toLowerCase().includes(query) || (r.guestName && r.guestName.toLowerCase().includes(query)));
      if (!matches.length) return { found: false, message: `No room or guest matching "${call.arguments.query}".` };
      return {
        found: true,
        matches: matches.slice(0, 10).map((r) => {
          const guest = r.guestId ? snapshot.guests.find((g) => g.id === r.guestId) : null;
          return {
            room: r.number,
            floor: r.floor,
            status: r.status,
            guest: guest ? { name: guest.name, segment: guest.segment, loyalty: guest.loyalty, vip: guest.vip, sentiment: round2(guest.sentiment), totalSpend: guest.totalSpend } : null,
            maintenanceRiskPercent: pct(r.maintRisk),
          };
        }),
      };
    }
    case "list_open_issues": {
      const onlyBreached = call.arguments.onlyBreached === true;
      const requests = onlyBreached ? snapshot.openRequests.filter((r) => r.slaBreached) : snapshot.openRequests;
      return {
        openRequestCount: snapshot.openRequests.length,
        breachedCount: snapshot.openRequests.filter((r) => r.slaBreached).length,
        requests: requests.slice(0, 15).map((r) => ({ room: r.room, type: r.type, text: r.text, status: r.status, ageMinutes: r.ageMinutes, slaBreached: r.slaBreached, assignedTo: r.assignedTo })),
        alerts: snapshot.openAlerts.slice(0, 10).map((a) => ({ severity: a.severity, title: a.title, ageMinutes: a.ageMinutes })),
      };
    }
    case "list_guests": {
      const filter = String(call.arguments.filter ?? "all");
      let guests = snapshot.guests;
      if (filter === "vip") guests = guests.filter((g) => g.vip);
      else if (filter === "unhappy") guests = guests.filter((g) => g.sentiment < -0.2);
      else if (["platinum", "gold", "silver"].includes(filter)) guests = guests.filter((g) => g.loyalty === filter);
      return {
        matchCount: guests.length,
        guests: guests.slice(0, 20).map((g) => ({ name: g.name, room: g.room, segment: g.segment, loyalty: g.loyalty, vip: g.vip, sentiment: round2(g.sentiment), totalSpend: g.totalSpend })),
      };
    }
    case "list_planned_actions": {
      const vipOnly = call.arguments.vipOnly === true;
      const guestNameQuery = String(call.arguments.guestName ?? "").trim().toLowerCase();
      let actions = snapshot.pendingRecommendations;
      if (vipOnly) {
        const vipGuestIds = new Set(snapshot.guests.filter((g) => g.vip).map((g) => g.id));
        actions = actions.filter((r) => r.targetKind === "guest" && vipGuestIds.has(r.targetId));
      }
      if (guestNameQuery) {
        const matchIds = new Set(snapshot.guests.filter((g) => g.name.toLowerCase().includes(guestNameQuery)).map((g) => g.id));
        actions = actions.filter((r) => r.targetKind === "guest" && matchIds.has(r.targetId));
      }
      return {
        count: actions.length,
        actions: actions.slice(0, 15).map((r) => ({ module: r.module, title: r.title, impact: r.impact, confidencePercent: pct(r.confidence) })),
      };
    }
    case "get_resort_summary":
      return {
        asOf: snapshot.asOfSimTime,
        occupancyPercent: pct(snapshot.kpis.occupancy),
        adr: Math.round(snapshot.kpis.adr),
        revpar: Math.round(snapshot.kpis.revpar),
        guestSatisfactionScore: round2(snapshot.kpis.gss),
        revenueToday: Math.round(snapshot.kpis.revenueToday),
        openRequests: snapshot.openRequests.length,
        openAlerts: snapshot.openAlerts.length,
        pendingRecommendations: snapshot.pendingRecommendations.length,
      };
    case "get_financials": {
      const f = snapshot.financials;
      return {
        currency: "INR",
        asOf: snapshot.asOfSimTime,
        rooms: { total: f.totalRooms, occupied: f.occupiedRooms },
        occupancyPercent: pct(snapshot.kpis.occupancy),
        adr: Math.round(snapshot.kpis.adr),
        revpar: Math.round(snapshot.kpis.revpar),
        trevpar: Math.round(f.trevpar),
        roomRevenueToday: Math.round(snapshot.kpis.revenueToday),
        ancillaryRevenueToday: Math.round(f.ancillaryRevenueToday + f.organicAncillaryToday),
        totalRevenueToday: Math.round(f.trevpar * f.totalRooms),
        directBookingSharePercent: pct(f.directBookingShare),
        otaCommissionAvoidedToday: Math.round(f.otaCommissionSavedToday),
        otaCommissionRateAssumed: "20% blended (estimate, not a ledger line)",
        directBookedRevenueToday: Math.round(f.otaCommissionSavedToday / 0.2),
        otaCommissionAvoidedAtOtherRates: { "15%": Math.round((f.otaCommissionSavedToday / 0.2) * 0.15), "20%": Math.round(f.otaCommissionSavedToday), "25%": Math.round((f.otaCommissionSavedToday / 0.2) * 0.25) },
        energyToday: Math.round(f.energyToday),
        energySavedToday: Math.round(f.energySavedToday),
        staffOnShift: f.staffOnShift,
        pricingEngine: {
          currentRateMultiplier: round2(f.currentRateMultiplier),
          recommendedRateMultiplier: round2(f.recommendedRateMultiplier),
          currentAdr: Math.round(f.currentAdr),
          recommendedAdr: Math.round(f.recommendedAdr),
          currentRevpar: Math.round(f.currentRevpar),
          projectedRevpar: Math.round(f.projectedRevpar),
          projectedOccupancyPercent: pct(f.projectedOccupancy),
          projectedRevparChangePercent: f.currentRevpar > 0 ? round2(((f.projectedRevpar - f.currentRevpar) / f.currentRevpar) * 100) : null,
          demandElasticity: round2(f.elasticity),
          dailyRoomRevenueAtCurrentRate: Math.round(f.currentRevpar * f.totalRooms),
          dailyRoomRevenueAtRecommendedRate: Math.round(f.projectedRevpar * f.totalRooms),
          dailyRoomRevenueChange: Math.round((f.projectedRevpar - f.currentRevpar) * f.totalRooms),
          workingShown: "RevPAR = ADR x occupancy; daily room revenue = RevPAR x total rooms; the engine also re-solves occupancy at the new rate using the elasticity, so occupancy may drop while RevPAR rises",
          note: "A recommendation only fires when the optimum differs from the live rate by more than 4%.",
        },
        provenance: "Simulated property; formulas are the real implemented ones.",
      };
    }
    case "get_weather_outlook":
      return {
        source: snapshot.weather.source === "live" ? "live Open-Meteo forecast" : "simulated seeded forecast (Open-Meteo not reachable)",
        twinCalibration: snapshot.weather.calibration
          ? { rainToFnbSlope: { prior: snapshot.weather.calibration.priorSlope, learned: round2(snapshot.weather.calibration.learnedSlope), plusMinus95: round2(1.96 * snapshot.weather.calibration.learnedSd) }, observations: snapshot.weather.calibration.observations, note: "the twin re-learns this from wet-tick observations; multipliers below already use the learned value" }
          : undefined,
        days: snapshot.weather.days.map((d) => ({
          dayOffset: d.dayOffset,
          condition: d.condition,
          tempC: d.tempC,
          rainProbabilityPercent: pct(d.rainProbability),
          effect: d.narrative,
          fnbSpendMultiplier: round2(d.fnbSpendMultiplier),
          fnbSpendChangePercent: round2((d.fnbSpendMultiplier - 1) * 100),
          daytimeInRoomPresenceBump: round2(d.daytimePresenceBump),
          zoneDemandMultipliers: Object.fromEntries(Object.entries(d.zoneMultiplier).map(([k, v]) => [k, round2(v)])),
        })),
      };
    case "get_weather_whatif": {
      const w = snapshot.weatherWhatIf;
      if (!w) return { error: "The what-if projection was not computed for this question. Answer from get_weather_outlook and search_knowledge instead, and say the full Monte Carlo band is on the Weather what-if panel." };
      const which = String(call.arguments.scenario ?? "both");
      const band = (b: { p10: number; p50: number; p90: number }, digits = 2) => ({ p10: +b.p10.toFixed(digits), p50: +b.p50.toFixed(digits), p90: +b.p90.toFixed(digits) });
      const fmt = (r: typeof w.rain) => ({
        scenario: r.scenario,
        narrative: r.narrative,
        method: `${r.runs} independent seeds, ${r.horizonHours}h horizon; every figure is scenario minus an identical clear day (positive = scenario raises it)`,
        occupancyDelta: band(r.occupancyDelta, 3),
        fnbDemandDelta: band(r.fnbDemandDelta),
        energyDelta: band(r.energyDelta),
        unmetStaffingDelta: band(r.staffingUnmetDelta),
        hvacRiskDelta: band(r.hvacRiskDelta, 3),
        openFnbConciergeRequestsDelta: band(r.openFnbConciergeRequestsDelta),
        zoneDemandMultipliers: Object.fromEntries(Object.entries(r.zoneMultiplier).map(([k, v]) => [k, round2(v)])),
      });
      return { rain: which !== "heatwave" ? fmt(w.rain) : undefined, heatwave: which !== "rain" ? fmt(w.heatwave) : undefined, caveat: "Modeled, not measured; six independent runs give a coarse uncertainty band." };
    }
    case "get_public_signals": {
      const g = snapshot.signals;
      if (g.source === "none") return { available: false, message: "Public signals have not been fetched yet in this session (open the Weather twin page once to load them)." };
      return {
        available: true,
        concernScorePercent: pct(g.concernScore),
        googleTrendsInterest: g.trendScore,
        sourcesLive: Object.entries(g.sources).filter(([, ok]) => ok).map(([k]) => k),
        sourcesUnreachable: Object.entries(g.sources).filter(([, ok]) => !ok).map(([k]) => k),
        officialHazards: g.hazards.map((h) => ({ ...h, assessment: h.distanceKmFromResort <= 500 ? "within 500 km of the resort: treat as a direct threat and brief the duty manager" : "more than 500 km from the resort: monitoring only, not an immediate threat" })),
        headlines: g.headlines,
        method: "concern = (keyword share*1 + hazard*2 + trend*1) / weights present; coarse keyword-and-hazard blend, not a trained classifier.",
      };
    }
    case "get_asset_risk":
      return {
        method: "P(fail<=7d) = 1 - (1 - Weibull base hazard) * exp(-0.45 * anomaly); recommendation fires above 35%. Reactive repair costs 3-5x planned (industry benchmark).",
        assets: snapshot.assets.map((a) => ({ name: a.name, kind: a.kind, floor: a.floor, status: a.status, failureProbability7dPercent: pct(a.failureProb7d), remainingUsefulLifeDays: Math.round(a.rulDays), healthPercent: pct(a.health) })),
      };
    case "calculate": {
      const expr = String(call.arguments.expression ?? "");
      const r = safeCalculate(expr);
      return r.ok ? { expression: expr, result: Math.abs(r.result) >= 1000 ? Math.round(r.result * 100) / 100 : Math.round(r.result * 10000) / 10000 } : { expression: expr, error: r.error };
    }
    case "search_knowledge": {
      const hits = searchKnowledge(String(call.arguments.query ?? ""), 3);
      return hits.length ? { results: hits.map((h) => ({ topic: h.title, detail: h.text })) } : { results: [], message: "No matching system documentation." };
    }
    default:
      return { error: `unknown tool "${call.name}"` };
  }
}

const NUM = /₹?\s*\d[\d,]*(?:\.\d+)?/g;
function numbersIn(text: string, min: number): number[] {
  return (text.match(NUM) ?? []).map((m) => parseFloat(m.replace(/[₹,\s]/g, ""))).filter((n) => Number.isFinite(n) && Math.abs(n) >= min);
}

/** Numbers of 1,000+ that appear in a reply but nowhere in the data the model was given (live tool
 * output, the user's own message, or a calculate result) — i.e. figures the model made up or did
 * mental arithmetic for. Rounding tolerance 0.6% so "₹21.5 lakh" style restatements still match. */
export function ungroundedFigures(reply: string, sourceText: string): number[] {
  const allowed = numbersIn(sourceText, 1);
  const bad = numbersIn(reply, 1000).filter((n) => !allowed.some((a) => a === n || (a !== 0 && Math.abs(a - n) / Math.abs(a) < 0.006)));
  return [...new Set(bad)];
}

const UNIT: Record<string, number> = { crore: 1e7, cr: 1e7, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, k: 1e3 };
const inrFmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Exact arithmetic on figures the USER states in the question ("₹8 lakh a month", "20 to 40%",
 * "per year"), so ROI and savings questions are answered from verified numbers, not mental math. */
export function precomputeUserMath(message: string): string | null {
  const amounts = [...message.matchAll(/(?:₹|rs\.?\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|k)?\b/gi)]
    .map((m) => ({ raw: m[0], n: parseFloat(m[1].replace(/,/g, "")), unit: (m[2] ?? "").toLowerCase(), rupee: /₹|rs/i.test(m[0]) }))
    .filter((a) => a.unit || (a.rupee && a.n >= 100))
    .map((a) => a.n * (UNIT[a.unit] ?? 1));
  if (!amounts.length) return null;
  const pcts: number[] = [];
  for (const m of message.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*(?:to|-|–|and)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/gi)) pcts.push(parseFloat(m[1]), parseFloat(m[2]));
  for (const m of message.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent)/gi)) if (!pcts.includes(parseFloat(m[1]))) pcts.push(parseFloat(m[1]));
  const lower = message.toLowerCase();
  const perMonth = /(a|per|each|every)\s*month|monthly/.test(lower);
  const perWeek = /(a|per|each|every)\s*week|weekly/.test(lower);
  const perDay = /(a|per|each|every)\s*day|daily/.test(lower);
  const wantYear = /year|annual|12 months/.test(lower);
  const factor = wantYear ? (perMonth ? 12 : perWeek ? 52 : perDay ? 365 : 1) : 1;
  const lines: string[] = [];
  for (const base of amounts.slice(0, 2)) {
    const annual = base * factor;
    lines.push(`Base ${inrFmt(base)}${factor > 1 ? ` x ${factor} = ${inrFmt(annual)} over the year` : ""}`);
    for (const p of pcts.slice(0, 4)) lines.push(`  ${p}% of ${inrFmt(annual)} = ${inrFmt((annual * p) / 100)}; after a ${p}% reduction = ${inrFmt(annual * (1 - p / 100))}; after a ${p}% increase = ${inrFmt(annual * (1 + p / 100))}`);
  }
  return lines.join("\n");
}

/** Deterministic routing of a question to the tools that answer it — used to pre-fetch live data so the
 * model (Nugen-aligned or Ollama) reads facts instead of having to choose and call tools itself. Covers the
 * original five lookup tools as well as the newer ones; the LLM's own tool-calling stays as a fallback. */
export function routeTools(message: string, snapshot: OpsSnapshot): ToolCall[] {
  const m = message.toLowerCase();
  const calls: ToolCall[] = [];
  const add = (name: string, args: Record<string, unknown> = {}) => {
    if (!calls.some((c) => c.name === name && JSON.stringify(c.arguments) === JSON.stringify(args))) calls.push({ name, arguments: args });
  };
  const room = /\b(?:room|rm|suite)?\s*#?(\d{3})\b/.exec(m);
  if (room && snapshot.rooms.some((r) => r.number === room[1])) add("find_room", { query: room[1] });
  const named = snapshot.guests.find((g) => g.name.split(/\s+/).every((p) => p.length > 2 && m.includes(p.toLowerCase())));
  if (named) {
    add("find_room", { query: named.name });
    add("list_planned_actions", { guestName: named.name });
  }
  if (/\bvips?\b/.test(m)) add("list_guests", { filter: "vip" });
  if (/\b(planned|queued|planning|recommend|pending|lined up|what are we doing|next best)/.test(m)) add("list_planned_actions", /\bvips?\b/.test(m) ? { vipOnly: true } : {});
  if (/\b(unhappy|dissatisf|angry|upset|complain|sentiment|satisfaction (is )?down|why is satisfaction)/.test(m)) {
    add("list_guests", { filter: "unhappy" });
    add("list_open_issues");
  }
  if (/\b(platinum|gold|silver)\b/.exec(m)) add("list_guests", { filter: /\b(platinum|gold|silver)\b/.exec(m)![1] });
  if (/\b(sla|breach|overdue|late requests?)\b/.test(m)) add("list_open_issues", { onlyBreached: true });
  else if (/\b(problem|issues?|attention|open requests?|needs? (my )?attention|going wrong|alerts?)\b/.test(m)) add("list_open_issues");
  if (/\b(how is the resort|resort doing|kpi|summary|overview|occupancy|performance|satisfaction|today)\b/.test(m) && !/\b(revenue|revpar|adr|price|commission)\b/.test(m)) add("get_resort_summary");
  for (const name of suggestTools(message)) if (name !== "calculate") add(name, name === "search_knowledge" ? { query: message } : {});
  return calls;
}
