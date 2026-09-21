import type { ResortModel } from "@/lib/architecture/types";
import type { Dept, Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

export const depts: Dept[] = ["housekeeping", "engineering", "fnb", "frontdesk", "concierge", "spa", "security"];

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
