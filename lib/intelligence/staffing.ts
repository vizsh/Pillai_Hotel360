import type { ResortModel } from "@/lib/architecture/types";
import type { Dept, Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

export const depts: Dept[] = ["housekeeping", "engineering", "fnb", "frontdesk", "concierge", "spa", "security"];

/** Rooms per attendant per 8h shift a room attendant can sustainably clean — industry
 * sources put the range at 12-16; this is the midpoint. Load above this is what the
 * fatigue/burnout model (see engine.ts's tick, and hkBurnoutRecommendation below) treats
 * as overload rather than a normal day's work. */
export const STANDARD_ROOMS_PER_HK_SHIFT = 14;
/** Staff.fatigue accrual/decay rates (0-1 scale, per hour). Base accrual applies even at
 * standard load — ordinary work is still tiring; overload accrual scales with how far the
 * current backlog-per-attendant sits above STANDARD_ROOMS_PER_HK_SHIFT. Recovery only
 * happens off-duty. At standard load these settle toward ~0 over a normal off-duty window;
 * sustained overload accumulates day over day since nothing here models rest days. */
export const FATIGUE_BASE_ACCRUAL = 0.02;
export const FATIGUE_OVERLOAD_ACCRUAL = 0.1;
export const FATIGUE_RECOVERY_RATE = 0.02;
/** Fatigue level above which a room attendant is treated as at elevated turnover risk. */
export const BURNOUT_THRESHOLD = 0.65;

export interface HourDemand {
  hour: number;
  demand: Record<Dept, number>;
}

const profile: Record<Dept, number[]> = {
  housekeeping: [0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.5, 0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.5, 0.6, 0.5, 0.3, 0.2, 0.1],
  engineering: [0.3, 0.3, 0.6, 0.6, 0.5, 0.4, 0.5, 0.6, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.6, 0.5, 0.5, 0.4, 0.3, 0.3],
  fnb: [0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.7, 1.0, 1.0, 0.8, 0.5, 0.6, 0.9, 0.9, 0.5, 0.4, 0.4, 0.6, 0.9, 1.0, 1.0, 0.8, 0.5, 0.2],
  frontdesk: [0.3, 0.2, 0.2, 0.2, 0.3, 0.5, 0.7, 0.8, 0.7, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9, 0.8, 0.7, 0.7, 0.7, 0.6, 0.5, 0.4, 0.3],
  concierge: [0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 0.9, 0.8, 0.7, 0.7, 0.8, 0.9, 0.9, 0.8, 0.7, 0.6, 0.5, 0.3, 0.2, 0.1],
  spa: [0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.9, 0.7, 0.7, 0.8, 0.9, 1.0, 0.9, 0.7, 0.5, 0.3, 0.1, 0, 0],
  security: [0.8, 0.8, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9, 0.8],
};

const baseline: Record<Dept, number> = { housekeeping: 9, engineering: 3, fnb: 7, frontdesk: 3, concierge: 2, spa: 2, security: 2 };

export function forecastDemand(state: SimState, model: ResortModel): HourDemand[] {
  const occ = state.kpis.occupancy;
  const dirty = Object.values(state.rooms).filter((r) => r.status === "vacant-dirty").length;
  const risk = Object.values(state.assets).filter((a) => a.failureProb7d > 0.35).length;
  const out: HourDemand[] = [];
  for (let h = 0; h < 24; h++) {
    const demand = {} as Record<Dept, number>;
    for (const d of depts) {
      let v = baseline[d] * profile[d][h] * (0.55 + occ * 0.6);
      if (d === "housekeeping") v += (dirty / 6) * profile[d][h];
      if (d === "engineering") v += risk * 0.6;
      if (d === "fnb" && state.scenario === "conference-block") v *= 1.25;
      demand[d] = Math.round(v * 10) / 10;
    }
    out.push({ hour: h, demand });
  }
  return out;
}

export interface ShiftPlan {
  dept: Dept;
  shift: "morning" | "evening" | "night";
  required: number;
  rostered: number;
  gap: number;
}

export function solveRoster(state: SimState, model: ResortModel): { plan: ShiftPlan[]; cost: number; unmet: number; overtime: number } {
  const demand = forecastDemand(state, model);
  const shifts = { morning: [6, 14], evening: [14, 22], night: [22, 30] } as const;
  const plan: ShiftPlan[] = [];
  let unmet = 0;
  let overtime = 0;
  for (const d of depts) {
    const staff = Object.values(state.staff).filter((s) => s.dept === d);
    const avail = { morning: staff.filter((s) => s.shift === "morning").length, evening: staff.filter((s) => s.shift === "evening").length, night: staff.filter((s) => s.shift === "night").length };
    const req = {} as Record<"morning" | "evening" | "night", number>;
    for (const [name, [a, b]] of Object.entries(shifts) as ["morning" | "evening" | "night", readonly [number, number]][]) {
      let peak = 0;
      for (let h = a; h < b; h++) peak = Math.max(peak, demand[h % 24].demand[d]);
      req[name] = Math.ceil(peak);
    }
    let total = staff.length;
    const alloc = { ...avail };
    for (let iter = 0; iter < 40; iter++) {
      const gaps = (["morning", "evening", "night"] as const).map((s) => ({ s, gap: req[s] - alloc[s] }));
      const worst = gaps.sort((x, y) => y.gap - x.gap)[0];
      const bestSurplus = gaps.sort((x, y) => x.gap - y.gap)[0];
      if (worst.gap <= 0 || bestSurplus.gap >= 0) break;
      alloc[worst.s]++;
      alloc[bestSurplus.s]--;
    }
    for (const s of ["morning", "evening", "night"] as const) {
      const gap = req[s] - alloc[s];
      if (gap > 0) unmet += gap;
      if (gap < 0) overtime += 0;
      plan.push({ dept: d, shift: s, required: req[s], rostered: alloc[s], gap });
    }
    total = 0;
  }
  return { plan, cost: unmet * 3 + overtime, unmet, overtime };
}

export function staffingRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const { plan, unmet } = solveRoster(state, model);
  const out: Recommendation[] = [];
  const hour = Math.floor((state.t % 1440) / 60);
  const currentShift = hour >= 6 && hour < 14 ? "morning" : hour >= 14 && hour < 22 ? "evening" : "night";
  const nextShift = currentShift === "morning" ? "evening" : currentShift === "evening" ? "night" : "morning";
  for (const p of plan) {
    if (p.shift !== nextShift || p.gap <= 0) continue;
    const onNow = Object.values(state.staff).filter((s) => s.dept === p.dept && s.status !== "off").length;
    out.push({
      id: `rec-staff-${p.dept}-${p.shift}`,
      module: "staffing",
      title: `${p.dept[0].toUpperCase() + p.dept.slice(1)} short by ${p.gap} on ${p.shift} shift`,
      body: `Forecast peak demand ${p.required} vs ${p.rostered} rostered. Local-search rebalance cannot close the gap from other shifts without creating a larger one.`,
      confidence: clamp(0.6 + Math.min(0.25, state.kpis.occupancy * 0.25), 0, 0.9),
      basis: [
        `hourly demand profile × occupancy ${(state.kpis.occupancy * 100).toFixed(0)}%${p.dept === "housekeeping" ? ` × ${Object.values(state.rooms).filter((r) => r.status === "vacant-dirty").length} dirty rooms` : ""}`,
        `greedy shift allocation + pairwise swap improvement, ${unmet} unmet slots resort-wide`,
        `${onNow} ${p.dept} staff currently on duty`,
      ],
      impact: `Closing the gap keeps ${p.dept} SLA breaches near zero; each unmet slot adds ~${p.dept === "housekeeping" ? 4 : 2} late requests per shift in the model.`,
      action: `Call in ${p.gap} ${p.dept} from the off-shift pool for ${p.shift}.`,
      targetKind: "resort",
      targetId: p.dept,
      createdAt: state.t,
      status: "pending",
      payload: { dept: p.dept, shift: p.shift, count: p.gap },
    });
  }
  return out.slice(0, 2);
}

export interface HkFatigueAssessment {
  staffCount: number;
  avgFatigue: number;
  atRisk: { id: string; name: string; fatigue: number }[];
  loadPerAttendant: number;
}

export function assessHousekeepingFatigue(state: SimState): HkFatigueAssessment {
  const hk = Object.values(state.staff).filter((s) => s.dept === "housekeeping");
  const onDuty = hk.filter((s) => s.status !== "off");
  const dirty = Object.values(state.rooms).filter((r) => r.status === "vacant-dirty").length;
  return {
    staffCount: hk.length,
    avgFatigue: hk.length ? hk.reduce((sum, s) => sum + s.fatigue, 0) / hk.length : 0,
    atRisk: hk
      .filter((s) => s.fatigue >= BURNOUT_THRESHOLD)
      .map((s) => ({ id: s.id, name: s.name, fatigue: s.fatigue }))
      .sort((a, b) => b.fatigue - a.fatigue),
    loadPerAttendant: onDuty.length ? dirty / onDuty.length : dirty,
  };
}

/** SHRM's 2025 fully-loaded average cost to replace an hourly hospitality worker
 * (recruiting + onboarding + training + productivity ramp), converted at ~₹83/$ — the
 * "human cost" this module prices against sustained housekeeping understaffing. */
const REPLACEMENT_COST_INR = 820_000;
/** Documented departure rate for room attendants who stay overworked — hotel housekeeper
 * burnout research puts first-90-day departure as high as 55% under sustained overload. */
const OVERLOAD_DEPARTURE_ODDS = 0.55;

export function housekeepingBurnoutRecommendations(state: SimState): Recommendation[] {
  const a = assessHousekeepingFatigue(state);
  // Below this, it's a couple of tired attendants on a hard afternoon, not a burnout pattern
  // worth interrupting a shift lead over.
  if (a.atRisk.length < 2) return [];

  const hour = Math.floor((state.t % 1440) / 60);
  const currentShift = hour >= 6 && hour < 14 ? "morning" : hour >= 14 && hour < 22 ? "evening" : "night";
  const nextShift = currentShift === "morning" ? "evening" : currentShift === "evening" ? "night" : "morning";
  const callIn = Math.min(3, Math.max(1, Math.ceil(a.atRisk.length / 2)));
  const exposure = a.atRisk.length * REPLACEMENT_COST_INR * OVERLOAD_DEPARTURE_ODDS;
  // Confidence tracks how far over threshold the at-risk cohort itself sits — not diluted
  // by averaging against the rest of housekeeping, most of whom aren't at risk at all.
  const atRiskAvgFatigue = a.atRisk.reduce((sum, s) => sum + s.fatigue, 0) / a.atRisk.length;

  return [
    {
      id: "rec-staff-hk-burnout",
      module: "staffing",
      title: `${a.atRisk.length} housekeeping staff at elevated burnout risk`,
      body: `${a.loadPerAttendant.toFixed(1)} dirty rooms per on-duty attendant vs the ${STANDARD_ROOMS_PER_HK_SHIFT}-room shift standard. Sustained overload at this level is the documented path to burnout and turnover intent, not just a hard afternoon.`,
      confidence: clamp(0.5 + Math.min(0.35, (atRiskAvgFatigue - BURNOUT_THRESHOLD) * 1.5), 0, 0.9),
      basis: [
        `${a.atRisk.length} of ${a.staffCount} housekeeping staff ≥ ${(BURNOUT_THRESHOLD * 100).toFixed(0)}% fatigue (accrues on overloaded shifts, recovers off-duty)`,
        `current load ${a.loadPerAttendant.toFixed(1)} rooms/attendant vs the ${STANDARD_ROOMS_PER_HK_SHIFT}-room industry standard`,
        `room attendants held at sustained overload show up to a ${(OVERLOAD_DEPARTURE_ODDS * 100).toFixed(0)}% departure rate within 90 days (hotel housekeeper burnout research)`,
      ],
      impact: `≈₹${Math.round(exposure).toLocaleString("en-IN")} potential replacement-cost exposure if elevated risk converts to turnover (SHRM-benchmarked ~₹8.2L avg fully-loaded replacement cost per hourly hospitality departure, at documented departure odds for an overloaded attendant).`,
      action: `Call in ${callIn} housekeeping from the off-shift pool for ${nextShift} to bring load back under the ${STANDARD_ROOMS_PER_HK_SHIFT}-room standard.`,
      targetKind: "resort",
      targetId: "housekeeping",
      createdAt: state.t,
      status: "pending",
      payload: { dept: "housekeeping", shift: nextShift, count: callIn },
    },
  ];
}
