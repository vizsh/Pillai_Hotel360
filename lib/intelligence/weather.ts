import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { DAY } from "@/lib/sim/seed";
import { clamp, mulberry32 } from "@/lib/utils";

export type WeatherCondition = "clear" | "rain" | "heatwave";

export interface WeatherDay {
  dayOffset: number;
  condition: WeatherCondition;
  tempC: number;
  rainProbability: number;
}

const HORIZON_DAYS = 7;
const HEATWAVE_PROB = 0.08;
const RAIN_PROB = 0.18;
/** monsoon-lull is explicitly the wet-season scenario — its rain probability reflects that
 * instead of drawing from the same base rate as every other scenario. */
const MONSOON_RAIN_BOOST = 0.4;

/** Deterministic per-day weather, keyed off the session seed and the calendar day index so
 * the live sim (engine.ts's asset wear tick) and this forecast always agree on "today's"
 * weather — no real weather API in this environment (no network egress in the sim), so this
 * is SIMULATED like every other signal in this codebase, tagged as such in the UI. */
export function weatherForDay(seed: number, dayIndex: number, scenario: SimState["scenario"]): WeatherDay {
  const r = mulberry32((seed ^ 0x9b5fa1) + dayIndex * 7919);
  const rainBoost = scenario === "monsoon-lull" ? MONSOON_RAIN_BOOST : 0;
  const roll = r();
  let condition: WeatherCondition;
  if (roll < HEATWAVE_PROB) condition = "heatwave";
  else if (roll < HEATWAVE_PROB + RAIN_PROB + rainBoost) condition = "rain";
  else condition = "clear";

  const tempC = Math.round(condition === "heatwave" ? 36 + r() * 4 : condition === "rain" ? 23 + r() * 4 : 27 + r() * 6);
  const rainProbability = clamp(condition === "rain" ? 0.6 + r() * 0.35 : condition === "heatwave" ? 0.02 : 0.05 + r() * 0.15, 0, 1);
  return { dayOffset: 0, condition, tempC, rainProbability };
}

export function forecastWeather(state: SimState): WeatherDay[] {
  const startDay = Math.floor(state.t / DAY);
  const out: WeatherDay[] = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    out.push({ ...weatherForDay(state.seed, startDay + offset, state.scenario), dayOffset: offset });
  }
  return out;
}

const OCCUPANCY_GATE = 0.3;

/** Weather playbooks: rain and heatwave each get one operational recommendation, gated on
 * meaningful occupancy (an empty resort doesn't need a poolside-staffing playbook) and on
 * today or tomorrow specifically — a playbook 5 days out isn't actionable yet. Guidance-only
 * (no dedicated "activities moved indoors" state exists to toggle), same pattern as
 * groupBlocks.ts's rate-floor guidance recommendations. */
export function weatherRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  if (state.kpis.occupancy < OCCUPANCY_GATE) return [];
  const out: Recommendation[] = [];
  const days = forecastWeather(state).slice(0, 2);
  const inHouse = Object.values(state.guests).filter((g) => g.roomId).length;

  const rainDay = days.find((d) => d.condition === "rain");
  if (rainDay) {
    out.push({
      id: "rec-weather-rain",
      module: "weather",
      title: `Rain playbook — ${rainDay.dayOffset === 0 ? "today" : "tomorrow"}`,
      body: `${(rainDay.rainProbability * 100).toFixed(0)}% rain probability, ${rainDay.tempC}°C, with ${inHouse} guests in house. Outdoor activities and poolside service lose demand; indoor F&B and spa gain it.`,
      confidence: clamp(0.45 + rainDay.rainProbability * 0.35, 0, 0.85),
      basis: [`${(rainDay.rainProbability * 100).toFixed(0)}% rain probability (simulated forecast)`, `${inHouse} in-house guests affected`, `standard rainy-day operations playbook: move activities indoors, push indoor offers, trim poolside staffing`],
      impact: `Avoids a service collapse at the one outlet everyone crowds into while another sits idle — the PS's own named rainy-day failure mode.`,
      action: `Move outdoor activities indoors, push a spa/indoor F&B offer to in-house guests, and trim poolside staffing for ${rainDay.dayOffset === 0 ? "today" : "tomorrow"}.`,
      targetKind: "resort",
      targetId: "weather",
      createdAt: state.t,
      status: "pending",
      payload: { condition: "rain", dayOffset: rainDay.dayOffset },
    });
  }

  const heatDay = days.find((d) => d.condition === "heatwave");
  if (heatDay) {
    out.push({
      id: "rec-weather-heatwave",
      module: "weather",
      title: `Heatwave playbook — ${heatDay.dayOffset === 0 ? "today" : "tomorrow"}`,
      body: `${heatDay.tempC}°C forecast. AC and chiller load rises sharply on heatwave days — the live wear model already runs these assets harder while this holds.`,
      confidence: 0.55,
      basis: [`${heatDay.tempC}°C forecast temperature`, `AHU/chiller wear rate runs ~60% hotter on a heatwave day (engine.ts)`, `heat-linked AC failure risk is a named PS edge case`],
      impact: `Front-loading AC/chiller inspection before the heat lands is cheaper than an emergency repair mid-heatwave with a full house.`,
      action: `Prioritise AHU/chiller inspection and add extra water stations for ${heatDay.dayOffset === 0 ? "today" : "tomorrow"}.`,
      targetKind: "resort",
      targetId: "weather",
      createdAt: state.t,
      status: "pending",
      payload: { condition: "heatwave", dayOffset: heatDay.dayOffset },
    });
  }

  return out;
}
