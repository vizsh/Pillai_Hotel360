import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { tick } from "@/lib/sim/engine";
import { solveRoster } from "./staffing";
import type { WeatherCondition, WeatherDay } from "./weather";
import { weatherDemandProfile } from "./weatherImpact";

/** The Digital Twin's actual "what if this weather happens" mechanism: HackCelestial's own
 * midnight-task brief asks for a system that can "simulate what-if and counterfactual
 * scenarios... and estimate how these changes could alter demand, capacity, movement,
 * availability, operations" and "update its simulated state... propagating changes across
 * interconnected entities... providing probabilistic predictions with associated uncertainty."
 *
 * Rather than a hand-written formula guessing at those effects, this clones the live state and
 * fast-forwards the REAL simulation tick (lib/sim/engine.ts) — the same one running the actual
 * dashboard — once with the forced weather scenario and once with forced clear weather, for
 * several independent random seeds, and reports the paired difference. Every cascade that shows
 * up (F&B demand, energy, staffing, asset risk) is one the tick already produces on its own
 * (lib/intelligence/weatherImpact.ts's profile is the only weather-specific logic in the whole
 * chain) — this file does no simulation of its own, only orchestrates and measures it. The
 * paired seeds (same seed run under both "clear" and the scenario) is what makes the resulting
 * percentile band a real uncertainty estimate on the CAUSAL EFFECT of the weather, not just
 * noise from the simulation's own randomness. The real state passed in is never mutated —
 * structuredClone makes a fully independent copy per run, discarded immediately after. */

export interface WeatherScenarioInput {
  condition: WeatherCondition;
  tempC: number;
  rainProbability: number;
}

export interface MetricBand {
  p10: number;
  p50: number;
  p90: number;
}

export interface WeatherWhatIfResult {
  scenario: WeatherScenarioInput;
  narrative: string;
  runs: number;
  horizonHours: number;
  /** Every field is the SCENARIO-MINUS-CLEAR delta over the horizon, paired per random seed —
   * positive means the scenario raises that metric relative to an otherwise-identical clear day. */
  occupancyDelta: MetricBand;
  fnbDemandDelta: MetricBand;
  energyDelta: MetricBand;
  staffingUnmetDelta: MetricBand;
  hvacRiskDelta: MetricBand;
  openFnbConciergeRequestsDelta: MetricBand;
  zoneMultiplier: Record<string, number>;
}

const HORIZON_HOURS = 8;
const TICK_MINUTES = 30;
const RUNS = 6;

function percentile(sorted: number[], p: number): number {
  const idx = clampIdx((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function clampIdx(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function band(values: number[]): MetricBand {
  const sorted = [...values].sort((a, b) => a - b);
  return { p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
}

function totalFnbSpend(state: SimState): number {
  let sum = 0;
  for (const g of Object.values(state.guests)) sum += g.spendFnb;
  return sum;
}
function totalRoomEnergy(state: SimState): number {
  let sum = 0;
  for (const r of Object.values(state.rooms)) sum += r.energyKwh;
  return sum;
}
function avgHvacRisk(state: SimState, model: ResortModel): number {
  const hvac = model.assets.filter((a) => a.kind === "chiller" || a.kind === "ahu");
  if (!hvac.length) return 0;
  return hvac.reduce((s, a) => s + (state.assets[a.id]?.failureProb7d ?? 0), 0) / hvac.length;
}
function openFnbConciergeCount(state: SimState): number {
  return Object.values(state.requests).filter((r) => r.status !== "done" && (r.type === "fnb" || r.type === "concierge")).length;
}

function runHorizon(state: SimState, model: ResortModel, seed: number, weather: WeatherDay | null): SimState {
  const clone: SimState = structuredClone(state);
  clone.seed = seed; // forces engine.ts's ensureRand to reseed its shared RNG for this clone
  const steps = Math.round((HORIZON_HOURS * 60) / TICK_MINUTES);
  for (let i = 0; i < steps; i++) tick(clone, model, TICK_MINUTES, weather ?? undefined);
  return clone;
}

export function runWeatherWhatIf(state: SimState, model: ResortModel, scenario: WeatherScenarioInput): WeatherWhatIfResult {
  const clearDay: WeatherDay = { dayOffset: 0, condition: "clear", tempC: 27, rainProbability: 0.1 };
  const scenarioDay: WeatherDay = { dayOffset: 0, ...scenario };
  const profile = weatherDemandProfile(scenarioDay);

  const occ: number[] = [];
  const fnb: number[] = [];
  const energy: number[] = [];
  const unmet: number[] = [];
  const hvac: number[] = [];
  const reqs: number[] = [];

  for (let i = 0; i < RUNS; i++) {
    // Two DISTINCT seeds per run, not one shared seed for both arms: engine.ts's ensureRand
    // only reseeds its shared RNG when state.seed actually changes from the previous call, so
    // calling it twice in a row with the same seed would silently let the second call continue
    // the first's random stream instead of replaying it — confirmed live (a same-seed pairing
    // produced a nonzero "clear vs. clear" delta in testing, which is exactly this bug).
    // Distinct seeds every call side-steps that guard entirely; this is independent-sample
    // Monte Carlo rather than a paired design, which is why RUNS needs to be large enough for
    // a stable band rather than relying on shared randomness to cancel out.
    const seedA = (state.seed ^ 0x7f4a1) + i * 2 * 104729;
    const seedB = seedA + 104729;
    const baseline = runHorizon(state, model, seedA, clearDay);
    const treated = runHorizon(state, model, seedB, scenarioDay);

    occ.push(treated.kpis.occupancy - baseline.kpis.occupancy);
    fnb.push(totalFnbSpend(treated) - totalFnbSpend(baseline));
    energy.push(totalRoomEnergy(treated) - totalRoomEnergy(baseline));
    hvac.push(avgHvacRisk(treated, model) - avgHvacRisk(baseline, model));
    reqs.push(openFnbConciergeCount(treated) - openFnbConciergeCount(baseline));

    const rosterBaseline = solveRoster(baseline, model);
    const rosterTreated = solveRoster(treated, model);
    unmet.push(rosterTreated.unmet - rosterBaseline.unmet);
  }

  return {
    scenario,
    narrative: profile.narrative,
    runs: RUNS,
    horizonHours: HORIZON_HOURS,
    occupancyDelta: band(occ),
    fnbDemandDelta: band(fnb),
    energyDelta: band(energy),
    staffingUnmetDelta: band(unmet),
    hvacRiskDelta: band(hvac),
    openFnbConciergeRequestsDelta: band(reqs),
    zoneMultiplier: profile.zoneMultiplier as Record<string, number>,
  };
}
