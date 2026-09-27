import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import type { WeatherCondition } from "./weather";

/** Feature C — "the cascade should prescribe, not just predict." A playbook is a named
 * checklist per weather archetype (the same three conditions the rest of the twin already
 * models) plus the set of currently pending recommendations that checklist implies — so
 * accepting "prepare for this" runs the SAME executeRecommendation() every accept button
 * already uses, just batched, rather than inventing a new automated action. */
export type WeatherArchetype = "monsoon-lull" | "heatwave-spike" | "clear";

export function archetypeFor(condition: WeatherCondition, rainProbability: number): WeatherArchetype {
  if (condition === "heatwave") return "heatwave-spike";
  if (condition === "rain" && rainProbability >= 0.5) return "monsoon-lull";
  return "clear";
}

export const PLAYBOOKS: Record<WeatherArchetype, { title: string; checklist: string[] }> = {
  "monsoon-lull": {
    title: "Monsoon / storm playbook",
    checklist: [
      "Move outdoor activities and pool-side service indoors; push the indoor F&B and spa offer.",
      "Rebalance the roster toward indoor departments for the affected shift.",
      "Inspect ground-floor and sea-facing rooms for flood/water-ingress risk before it becomes a relocation.",
      "Bring forward any HVAC/chiller service that is close to its 7-day failure threshold — heat-linked wear compounds after a storm.",
      "Brief the front desk on the regional hazard and expected guest transfer delays.",
    ],
  },
  "heatwave-spike": {
    title: "Heatwave playbook",
    checklist: [
      "Pre-cool common areas and top floors ahead of the peak.",
      "Bring forward AHU/chiller inspection — wear accelerates ~60% on a heatwave day.",
      "Add indoor/spa staffing; outdoor bookings soften.",
      "Confirm eco-mode is active on vacant rooms so cooling cost doesn't compound the load.",
    ],
  },
  clear: { title: "No weather playbook needed", checklist: ["Conditions are fair — no weather-driven preparation required right now."] },
};

/** Every currently pending recommendation the playbook would want bundled — weather, staffing
 * and energy modules, plus the social-trigger card if it is the one that raised this playbook. */
export function playbookRecommendations(state: SimState, _model: ResortModel): Recommendation[] {
  return Object.values(state.recommendations).filter((r) => r.status === "pending" && ["weather", "staffing", "energy"].includes(r.module));
}
