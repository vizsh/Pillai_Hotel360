import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { DAY, WEEKDAY_NAMES, dayOfWeekFactor, occupancyTarget } from "@/lib/sim/seed";
import { clamp } from "@/lib/utils";

const HORIZON_DAYS = 14;
/** Below this many observed same-weekday samples, seasonal-naive statistics are noise —
 * blend toward the scenario baseline instead of trusting a 1-2-point average. */
const MIN_OBSERVED_FOR_TRUST = 2;

export interface DemandDay {
  dayOffset: number;
  label: string;
  expectedOccupancy: number;
  occupancyLow: number;
  occupancyHigh: number;
  expectedAdr: number;
  expectedRevpar: number;
  confidence: number;
  drivers: string[];
  source: "observed" | "scenario-baseline";
}

/** The Demand Spine: a 1-14 day occupancy/ADR forecast every other module can read from,
 * instead of each one guessing independently (the blueprint's own framing of the single
 * highest-leverage architectural piece). Seasonal-naive forecasting — day-of-week buckets
 * of REAL observed occupancy from state.kpiHistory — blended toward the scenario's own
 * day-of-week-shaped baseline (lib/sim/seed.ts's dayOfWeekFactor, the same curve the live
 * sim itself uses) as the trust anchor while history is thin. This is deliberately not a
 * forward-reservations forecast: the simulator has no booking-pipeline (guests materialize
 * at check-in, per lib/sim/engine.ts's occupancy-deficit model — the same honest scoping
 * call made for groupBlocks.ts) — it forecasts the same demand *pattern* the engine itself
 * is already running on, which is the forecast that's actually available to build here. */
export function forecastDemand(state: SimState, model: ResortModel): DemandDay[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const h of state.kpiHistory) {
    const dow = Math.floor(h.t / DAY) % 7;
    buckets[dow].push(h.occupancy);
  }

  const out: DemandDay[] = [];
  const startDay = Math.floor(state.t / DAY);
  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const dayIndex = startDay + offset;
    const dow = dayIndex % 7;
    const observed = buckets[dow];
    const dowFactor = dayOfWeekFactor(dayIndex);
    const baseline = clamp(occupancyTarget(state.scenario) * dowFactor, 0.03, 0.99);

    let expected: number;
    let spread: number;
    let confidence: number;
    let source: DemandDay["source"];
    if (observed.length >= MIN_OBSERVED_FOR_TRUST) {
      const mean = observed.reduce((s, v) => s + v, 0) / observed.length;
      const variance = observed.reduce((s, v) => s + (v - mean) ** 2, 0) / observed.length;
      const std = Math.sqrt(variance);
      // More same-weekday samples -> trust the observed mean more; a handful of points still
      // leans on the scenario baseline so 2 noisy samples can't swing the forecast wildly.
      const historyWeight = clamp(observed.length / 6, 0.25, 0.85);
      expected = mean * historyWeight + baseline * (1 - historyWeight);
      spread = Math.max(std, 0.03);
      confidence = clamp(0.35 + historyWeight * 0.5, 0.35, 0.85);
      source = "observed";
    } else {
      expected = baseline;
      spread = 0.12;
      confidence = 0.3;
      source = "scenario-baseline";
    }
    expected = clamp(expected, 0.03, 0.99);

    const adr = state.baseRate * state.rateMultiplier;
    const drivers: string[] = [];
    const dowDelta = dowFactor - 1;
    if (Math.abs(dowDelta) > 0.03) drivers.push(`${WEEKDAY_NAMES[dow]} ${dowDelta > 0 ? "+" : ""}${(dowDelta * 100).toFixed(0)}% vs weekly average`);
    drivers.push(source === "observed" ? `${observed.length} observed ${WEEKDAY_NAMES[dow]}s this session` : `no ${WEEKDAY_NAMES[dow]} history yet — scenario baseline only`);

    out.push({
      dayOffset: offset,
      label: WEEKDAY_NAMES[dow],
      expectedOccupancy: expected,
      occupancyLow: clamp(expected - spread, 0.02, 0.99),
      occupancyHigh: clamp(expected + spread, 0.02, 0.99),
      expectedAdr: adr,
      expectedRevpar: adr * expected,
      confidence,
      drivers,
      source,
    });
  }
  return out;
}

/** The single day worth calling out in a "why this forecast" style summary — the highest
 * projected occupancy in the horizon, ties broken toward the sooner date. */
export function peakDemandDay(days: DemandDay[]): DemandDay | null {
  if (!days.length) return null;
  return days.reduce((best, d) => (d.expectedOccupancy > best.expectedOccupancy ? d : best), days[0]);
}
