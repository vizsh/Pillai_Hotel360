import type { ZoneKind } from "@/lib/architecture/types";
import type { WeatherCondition, WeatherDay } from "./weather";

/** Single source of truth for "what does today's weather actually change" — read by the live
 * simulation tick (lib/sim/engine.ts, so weather genuinely drives behaviour, not just a
 * display card), the weather what-if projection (lib/intelligence/weatherWhatIf.ts, so a
 * hypothetical scenario is scored with the exact same numbers the real tick would apply), and
 * the impact map (components/analytics/WeatherImpactMap.tsx, so the map's colours are the
 * literal multipliers in effect rather than a separately-invented visualization). One function,
 * three consumers — the same "don't build a parallel toy model" rule lib/intelligence/whatIf.ts
 * already follows for occupancy.
 *
 * Every multiplier here is a small, explainable nudge on a field that already exists in
 * SimState (organic F&B spend, outdoor-leisure request rate, in-room presence) — not a new
 * mechanic invented for this task. */
export interface WeatherDemandProfile {
  condition: WeatherCondition;
  /** Added to pickRequestType's request-category weights (lib/sim/text.ts) — positive raises
   * that category's share of organic guest requests today, negative lowers it. */
  requestBias: { fnb: number; concierge: number; amenity: number };
  /** Multiplies the organic per-tick F&B spend drift (engine.ts's fnbTick) — indoor dining and
   * room service pick up demand that outdoor F&B/pool-side service loses. */
  fnbSpendMultiplier: number;
  /** Added to daytime (10:00-18:00) in-room presence target — guests sit out a storm or a
   * heatwave in their room rather than by the pool, which (via the room's own existing
   * eco-mode threshold) is what actually drives the energy-consumption cascade. */
  daytimePresenceBump: number;
  /** Relative demand change per zone kind, for narration and the impact map — not consumed by
   * the tick itself (organic demand is guest-level, not zone-level, in this codebase's model),
   * kept honestly separate rather than forcing a fit. 1 = no change. */
  zoneMultiplier: Partial<Record<ZoneKind, number>>;
  /** One-line, plain-language explanation of the cascade, for the what-if panel and the map's
   * legend — the project's own "no bare number without an explanation" convention. */
  narrative: string;
}

const NEUTRAL: WeatherDemandProfile = {
  condition: "clear",
  requestBias: { fnb: 0, concierge: 0, amenity: 0 },
  fnbSpendMultiplier: 1,
  daytimePresenceBump: 0,
  zoneMultiplier: {},
  narrative: "Clear skies — no weather-driven demand shift.",
};

/** rainProbability and tempC scale each condition's severity within its own band (a 55%-chance
 * drizzle nudges demand less than a 95%-chance downpour) rather than treating every "rain" day
 * identically — a coarse but real severity signal, not a fixed step function. */
export function weatherDemandProfile(day: Pick<WeatherDay, "condition" | "tempC" | "rainProbability">): WeatherDemandProfile {
  if (day.condition === "rain") {
    const severity = Math.max(0.2, day.rainProbability); // floor so a "rain" day never reads as a no-op
    return {
      condition: "rain",
      requestBias: { fnb: 0.14 * severity, concierge: -0.07 * severity, amenity: -0.03 * severity },
      fnbSpendMultiplier: 1 + 0.35 * severity,
      daytimePresenceBump: 0.28 * severity,
      zoneMultiplier: { restaurant: 1 + 0.3 * severity, bar: 1 + 0.2 * severity, spa: 1 + 0.15 * severity, "pool-deck": 1 - 0.55 * severity, "sky-bar": 1 - 0.5 * severity, gym: 1 + 0.1 * severity },
      narrative: `Rain (${(day.rainProbability * 100).toFixed(0)}% probability): outdoor/pool-side demand drops, indoor F&B and spa pick it up, guests stay in-room through the day.`,
    };
  }
  if (day.condition === "heatwave") {
    const severity = Math.max(0.3, Math.min(1, (day.tempC - 34) / 6));
    return {
      condition: "heatwave",
      requestBias: { fnb: 0.06 * severity, concierge: -0.03 * severity, amenity: 0 },
      fnbSpendMultiplier: 1 + 0.15 * severity,
      daytimePresenceBump: 0.32 * severity,
      zoneMultiplier: { restaurant: 1 + 0.1 * severity, bar: 1 + 0.05 * severity, "pool-deck": 1 - 0.2 * severity, "sky-bar": 1 - 0.25 * severity, gym: 1 + 0.2 * severity, spa: 1 + 0.1 * severity },
      narrative: `Heatwave (${day.tempC}°C): guests retreat indoors and to the pool's shaded edges at midday, AC/chiller load rises sharply (already modelled in asset wear), outdoor bookings soften.`,
    };
  }
  return NEUTRAL;
}
