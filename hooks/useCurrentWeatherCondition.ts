"use client";

import { useSim } from "@/store/sim";
import { useWeatherWhatIf } from "@/store/weatherWhatIf";
import { forecastWeather, type WeatherCondition } from "@/lib/intelligence/weather";

/** Single source of truth for "what weather condition is in effect right now, for display
 * purposes" — read reactively (not a one-off getState() snapshot) by both the 3D twin's rain/
 * heat-haze effect (components/twin/WeatherFX.tsx) and the 2D regional map
 * (components/analytics/RegionalWeatherMap.tsx), so the two visualizations can never disagree
 * about which condition they're showing. Prefers an open Weather What-If override; falls back
 * to today's real forecast (live-else-seeded, same as the simulation tick itself). */
export function useCurrentWeatherCondition(): WeatherCondition {
  const wifActive = useWeatherWhatIf((s) => s.active);
  const wifCondition = useWeatherWhatIf((s) => s.scenario.condition);
  const simState = useSim((s) => s.state);
  useSim((s) => s.version);
  if (wifActive) return wifCondition;
  return forecastWeather(simState)[0].condition;
}
