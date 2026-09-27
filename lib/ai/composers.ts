import type { OpsSnapshot } from "./opsSnapshot";

/** Deterministic answer composers for the question shapes where a small local LLM cannot be
 * trusted with arithmetic: (1) the user's own figures ("₹8 lakh a month, cut 20 to 40%"), (2) a
 * commission at a different OTA rate, (3) a zone/outlet demand shock ("rain cuts pool-deck demand by
 * 55%"). Same principle as the rest of this project: the explanation is templated from measured
 * numbers, never generated. Returns null when the question is not one of these shapes, so the
 * assistant falls through to the tool-calling LLM. */
export interface ComposedAnswer {
  reply: string;
  toolsUsed: string[];
}

const UNIT: Record<string, number> = { crore: 1e7, cr: 1e7, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, k: 1e3 };
const inr = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function userAmounts(message: string): number[] {
  return [...message.matchAll(/(?:₹|rs\.?\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|k)?\b/gi)]
    .map((m) => ({ n: parseFloat(m[1].replace(/,/g, "")), unit: (m[2] ?? "").toLowerCase(), rupee: /₹|rs/i.test(m[0]) }))
    .filter((a) => a.unit || (a.rupee && a.n >= 100))
    .map((a) => a.n * (UNIT[a.unit] ?? 1));
}

function userPercents(message: string): number[] {
  const out: number[] = [];
  for (const m of message.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*(?:to|-|–|and)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/gi)) out.push(parseFloat(m[1]), parseFloat(m[2]));
  if (!out.length) for (const m of message.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent)/gi)) out.push(parseFloat(m[1]));
  return [...new Set(out)].slice(0, 3);
}

function md(rows: string[][], header: string[]): string {
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export function composeUserFiguresAnswer(message: string): ComposedAnswer | null {
  const lower = message.toLowerCase();
  if (/commission|ota|direct booking/.test(lower)) return null;
  if (/pool|sky.?bar|restaurant|spa|gym|outlet|zone|demand/.test(lower) && /rain|storm|weather|heat/.test(lower)) return null;
  const amounts = userAmounts(message);
  const pcts = userPercents(message);
  if (!amounts.length || !pcts.length) return null;
  const base = amounts[0];
  const perMonth = /(a|per|each|every)\s*month|monthly/.test(lower);
  const perWeek = /(a|per|each|every)\s*week|weekly/.test(lower);
  const perDay = /(a|per|each|every)\s*day|daily/.test(lower);
  const wantYear = /year|annual|12 months/.test(lower);
  const factor = wantYear ? (perMonth ? 12 : perWeek ? 52 : perDay ? 365 : 1) : 1;
  const period = wantYear ? "per year" : perMonth ? "per month" : perWeek ? "per week" : perDay ? "per day" : "";
  const annual = base * factor;
  const isIncrease = /increase|raise|rise|grow|uplift|boost|gain|extra|more revenue/.test(lower) && !/cut|reduc|save|saving|lower|decrease|drop/.test(lower);
  const verb = isIncrease ? "Gain" : "Saving";
  const rows: string[][] = [];
  if (factor > 1) rows.push(["Annualise", `${inr(base)} × ${factor}`, inr(annual)]);
  const results = pcts.map((p) => ({ p, v: (annual * p) / 100 }));
  for (const r of results) rows.push([`${verb} at ${num(r.p)}%`, `${inr(annual)} × ${num(r.p)}%`, inr(r.v)]);
  const lo = Math.min(...results.map((r) => r.v));
  const hi = Math.max(...results.map((r) => r.v));
  const headline = results.length > 1 ? `**${verb} of ${inr(lo)} to ${inr(hi)} ${period}**` : `**${verb} of ${inr(lo)} ${period}**`;
  const afterRows = results.map((r) => [`${isIncrease ? "New" : "Remaining"} cost/revenue at ${num(r.p)}%`, `${inr(annual)} × (1 ${isIncrease ? "+" : "−"} ${num(r.p)}%)`, inr(annual * (isIncrease ? 1 + r.p / 100 : 1 - r.p / 100))]);
  const reply = [
    headline,
    "",
    md([...rows, ...afterRows], ["Step", "Working", "Result"]),
    "",
    `Assumptions: the base (${inr(base)}${perMonth ? " per month" : ""}) and the percentage${pcts.length > 1 ? " range" : ""} are the figures you gave; nothing is taken from the live data, and the result scales linearly with both. For a benchmark: reactive maintenance typically costs 3–5× planned maintenance (industry range, not measured here).`,
    "",
    "Suggested next step: replace the percentage with the modeled failure-cost reduction once you have a real baseline of unplanned-failure spend.",
  ].join("\n");
  return { reply, toolsUsed: ["exact arithmetic"] };
}

export function composeCommissionAnswer(message: string, snapshot: OpsSnapshot): ComposedAnswer | null {
  const lower = message.toLowerCase();
  if (!/commission/.test(lower) || !/%|percent/.test(lower)) return null;
  const asked = userPercents(message).find((p) => p !== 20) ?? userPercents(message)[0];
  if (asked === undefined) return null;
  const f = snapshot.financials;
  const direct = f.otaCommissionSavedToday / 0.2;
  const rows: string[][] = [
    ["Direct-booked revenue today", "commission avoided at 20% ÷ 20%", inr(direct)],
    ["Commission avoided at model rate (20%)", `${inr(direct)} × 20%`, inr(direct * 0.2)],
    [`Commission avoided at ${num(asked)}%`, `${inr(direct)} × ${num(asked)}%`, inr((direct * asked) / 100)],
    ["Difference", `${inr((direct * asked) / 100)} − ${inr(direct * 0.2)}`, inr((direct * asked) / 100 - direct * 0.2)],
  ];
  const reply = [
    `**Direct bookings saved ${inr(direct * 0.2)} in OTA commission so far today at the 20% model rate — ${inr((direct * asked) / 100)} at ${num(asked)}%**`,
    "",
    md(rows, ["Step", "Working", "Result"]),
    "",
    `Basis: revenue-weighted direct-booking share is ${Math.round(f.directBookingShare * 100)}% of ${inr(snapshot.kpis.revenueToday)} room revenue booked so far today. This is an estimate against a counterfactual (what an OTA booking would have cost), not a ledger line, and it is a partial-day figure.`,
  ].join("\n");
  return { reply, toolsUsed: ["get_financials", "exact arithmetic"] };
}

const ZONES: [RegExp, string, string][] = [
  [/pool/, "pool-deck", "Pool deck"],
  [/sky.?bar/, "sky-bar", "Sky bar"],
  [/restaurant|dining/, "restaurant", "Restaurant"],
  [/\bspa\b/, "spa", "Spa"],
  [/\bbar\b/, "bar", "Bar"],
  [/gym/, "gym", "Gym"],
];

export function composeZoneShockAnswer(message: string, snapshot: OpsSnapshot): ComposedAnswer | null {
  const lower = message.toLowerCase();
  const zone = ZONES.find(([re]) => re.test(lower));
  const pct = userPercents(message)[0];
  if (!zone || pct === undefined || !/cut|drop|fall|reduc|declin|lose|down|decrease|slump/.test(lower)) return null;
  const wet = [...snapshot.weather.days].sort((a, b) => b.rainProbability - a.rainProbability)[0];
  const [, key, label] = zone;
  const userBase = userAmounts(message)[0];
  const illustrative = userBase ?? 100000;
  const lost = (illustrative * pct) / 100;
  const fnbMult = wet ? wet.fnbSpendMultiplier : 1;
  const gain = illustrative * (fnbMult - 1);
  const modelZone = wet?.zoneMultiplier[key];
  const rows: string[][] = [
    [`${label} revenue lost`, `${inr(illustrative)} × ${num(pct)}%`, inr(lost)],
    ["Indoor F&B/spa pick-up (model)", `${inr(illustrative)} of indoor spend × (${fnbMult.toFixed(2)} − 1)`, inr(gain)],
    ["Net effect on this base", `${inr(gain)} − ${inr(lost)}`, inr(gain - lost)],
  ];
  const reply = [
    `**A ${num(pct)}% cut in ${label.toLowerCase()} demand removes ${num(pct)}% of that outlet's revenue — and the modeled indoor shift recovers about ${Math.round((fnbMult - 1) * 100)}% on indoor F&B spend**`,
    "",
    md(rows, ["Step", "Working", `Result (per ${inr(illustrative)}/day base)`]),
    "",
    `The system does not track revenue per outlet, so the ₹ figures above are on an ${userBase ? "amount you gave" : `illustrative ${inr(illustrative)}-a-day base`} — replace it with the outlet's real daily revenue and the same percentages apply. The percentages themselves are from the model: on the wettest forecast day (day +${wet?.dayOffset ?? "?"}, ${wet ? Math.round(wet.rainProbability * 100) : "?"}% rain) F&B spend is ×${fnbMult.toFixed(2)}${modelZone !== undefined ? ` and ${label.toLowerCase()} demand ×${modelZone.toFixed(2)}` : ""}.`,
    "",
    "Suggested next step: move the pool-side service team indoors on wet days and pre-position restaurant and spa staff, using the Weather what-if panel for the staffing and HVAC bands.",
  ].join("\n");
  return { reply, toolsUsed: ["get_weather_outlook", "exact arithmetic"] };
}

const signed = (n: number, d = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d);

/** Weather / storm / "how should we prepare" questions: a templated briefing built from the forecast,
 * the Monte Carlo what-if bands and the regional hazard feed, with rule-based actions. */
export function composeWeatherBriefing(message: string, snapshot: OpsSnapshot): ComposedAnswer | null {
  const lower = message.toLowerCase();
  if (!/weather|rain|storm|monsoon|cyclone|heatwave|heat wave|forecast|flood|prepare|preparation/.test(lower)) return null;
  if (/how does|how do|explain|formula|works?|which api|trained|is it real|math behind|method/.test(lower)) return null;
  if (userPercents(message).length || userAmounts(message).length) return null;
  const days = snapshot.weather.days;
  if (!days.length) return null;
  const cyclone = /cyclone|storm|typhoon|flood|heavy rain|downpour|pour/.test(lower);
  const heat = /heat/.test(lower) && !cyclone;
  const scenario = snapshot.weatherWhatIf ? (heat ? snapshot.weatherWhatIf.heatwave : snapshot.weatherWhatIf.rain) : null;
  const wet = days.filter((d) => d.rainProbability >= 0.5);
  const hot = days.filter((d) => d.tempC >= 34);
  const worst = [...days].sort((a, b) => b.rainProbability - a.rainProbability)[0];
  const src = snapshot.weather.source === "live" ? "live Open-Meteo forecast" : "simulated forecast (Open-Meteo unreachable)";
  const headline =
    wet.length || hot.length
      ? `**${wet.length ? `${wet.length} wet day${wet.length > 1 ? "s" : ""}` : ""}${wet.length && hot.length ? " and " : ""}${hot.length ? `${hot.length} heatwave day${hot.length > 1 ? "s" : ""}` : ""} in the next 7 days — worst is day +${worst.dayOffset} at ${Math.round(worst.rainProbability * 100)}% rain, F&B spend ×${worst.fnbSpendMultiplier.toFixed(2)}, pool-deck demand ×${(worst.zoneMultiplier["pool-deck"] ?? 1).toFixed(2)}**`
      : "**No rain or heatwave days in the 7-day forecast — no weather-driven demand shift expected**";
  const forecast = md(
    days.map((d) => [`+${d.dayOffset}`, d.condition, `${Math.round(d.tempC)}°C`, `${Math.round(d.rainProbability * 100)}%`, `×${d.fnbSpendMultiplier.toFixed(2)}`, `×${(d.zoneMultiplier["pool-deck"] ?? 1).toFixed(2)}`]),
    ["Day", "Condition", "Temp", "Rain", "F&B spend", "Pool-deck demand"],
  );
  const band = (b: { p10: number; p50: number; p90: number }, f: (n: number) => string) => `${f(b.p50)} (P10 ${f(b.p10)} to P90 ${f(b.p90)})`;
  const whatIf = scenario
    ? [
        "",
        `**Modeled ${heat ? "heatwave" : "rain"} day vs a clear day, next 8 hours (Monte Carlo, ${scenario.runs} paired runs):**`,
        md(
          [
            ["Occupancy", band(scenario.occupancyDelta, (n) => `${signed(n * 100)} pp`)],
            ["F&B demand", band(scenario.fnbDemandDelta, (n) => (n < 0 ? "−" : "+") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN"))],
            ["Room energy load", band(scenario.energyDelta, (n) => `${signed(n, 0)} kWh`)],
            ["Unmet staffing", band(scenario.staffingUnmetDelta, (n) => `${signed(n)} shifts`)],
            ["HVAC failure risk", band(scenario.hvacRiskDelta, (n) => `${signed(n * 100)} pp`)],
            ["Open F&B/concierge requests", band(scenario.openFnbConciergeRequestsDelta, (n) => signed(n))],
          ],
          ["Metric", "Median change (range)"],
        ),
      ]
    : ["", "_The Monte Carlo band is on the Weather what-if panel; it was not computed for this question._"];
  const actions: string[] = [];
  if (wet.length) actions.push("Move pool-side and sky-bar service indoors on wet days and pre-position restaurant and spa staff (indoor demand rises while pool-deck demand falls).");
  if (scenario && scenario.staffingUnmetDelta.p50 > 0.3) actions.push(`Staffing: the model shows ${scenario.staffingUnmetDelta.p50.toFixed(1)} extra unmet shift${scenario.staffingUnmetDelta.p50 >= 1.5 ? "s" : ""} (median) — rebalance or call in cover before the weather arrives.`);
  else if (scenario) actions.push("Staffing: the roster solver absorbs this scenario without a genuine shortfall — no call-in needed.");
  if (scenario && scenario.energyDelta.p50 > 0) actions.push("Energy: guests stay in rooms, so room load rises — confirm eco-mode is active on the vacant floors.");
  if (scenario && scenario.hvacRiskDelta.p50 > 0.001 && snapshot.assets[0]) actions.push(`Maintenance: HVAC risk rises ${(scenario.hvacRiskDelta.p50 * 100).toFixed(1)} pp — inspect ${snapshot.assets[0].name} first (${Math.round(snapshot.assets[0].failureProb7d * 100)}% failure probability in 7 days).`);
  if (hot.length) actions.push("Heat: pre-cool common areas and keep chiller load headroom; outdoor bookings will soften.");
  const near = snapshot.signals.hazards[0];
  if (snapshot.signals.source === "live" && near) actions.push(near.distanceKmFromResort <= 500 ? `Regional hazard: ${near.name || `${near.eventType} ${near.alertLevel}`} is ${near.distanceKmFromResort} km away — brief the duty manager now.` : `Regional hazard: nearest official event (${near.name || `${near.eventType} ${near.alertLevel}`}) is ${near.distanceKmFromResort} km away — monitoring only, not an immediate threat.`);
  if (!actions.length) actions.push("Business as usual; re-check the forecast tomorrow.");
  const reply = [headline, "", forecast, ...whatIf, "", "**Suggested actions**", ...actions.map((a) => `- ${a}`), "", `Provenance: ${src}; what-if figures are modeled, not measured.`].join("\n");
  return { reply, toolsUsed: ["get_weather_outlook", ...(scenario ? ["get_weather_whatif"] : []), ...(snapshot.signals.source === "live" ? ["get_public_signals"] : [])] };
}

export function composeAssetAnswer(message: string, snapshot: OpsSnapshot): ComposedAnswer | null {
  const lower = message.toLowerCase();
  if (!/equipment|chiller|ahu|elevator|boiler|pump|generator|service first|about to fail|likely to fail|breakdown|predictive maintenance/.test(lower)) return null;
  if (/how does|how do|explain|formula|works?|which api|math behind|method|save|saving/.test(lower) || userAmounts(message).length) return null;
  const top = snapshot.assets.slice(0, 5);
  if (!top.length) return null;
  const first = top[0];
  const rows = top.map((a) => [a.name, a.kind, `${Math.round(a.failureProb7d * 100)}%`, `${Math.round(a.rulDays)} d`, `${Math.round(a.health * 100)}%`, a.failureProb7d >= 0.35 ? "Work order due" : "Watch"]);
  const reply = [
    `**Service ${first.name} first — ${Math.round(first.failureProb7d * 100)}% chance of failing within 7 days, ${Math.round(first.health * 100)}% health, about ${Math.round(first.rulDays)} days of useful life left**`,
    "",
    md(rows, ["Asset", "Type", "P(fail ≤ 7d)", "Est. life left", "Health", "Action"]),
    "",
    "Why waiting is expensive: reactive repair typically costs 3–5× planned maintenance (industry benchmark, not measured here), so every ₹1,00,000 of planned work deferred into a breakdown becomes roughly ₹3,00,000–₹5,00,000 — before counting guest relocation and lost room nights when a chiller or AHU serves occupied floors.",
    "",
    "Method: P(fail ≤ 7d) = 1 − (1 − Weibull base hazard) × exp(−0.45 × anomaly); a work order fires above 35%. Give a real planned-repair cost and I will compute the exact reactive exposure.",
  ].join("\n");
  return { reply, toolsUsed: ["get_asset_risk"] };
}

export function composeAnswer(message: string, snapshot: OpsSnapshot): ComposedAnswer | null {
  return composeCommissionAnswer(message, snapshot) ?? composeZoneShockAnswer(message, snapshot) ?? composeUserFiguresAnswer(message) ?? composeAssetAnswer(message, snapshot) ?? composeWeatherBriefing(message, snapshot);
}
