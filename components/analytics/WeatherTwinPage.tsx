"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSim } from "@/store/sim";
import { forecastWeather, weatherSource } from "@/lib/intelligence/weather";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { WeatherTwinPanel } from "@/components/command/WeatherTwinPanel";
import { WeatherImpactMap } from "./WeatherImpactMap";
import { SocialSignalFeed } from "./SocialSignalFeed";
import { CascadeGraph } from "./CascadeGraph";
import { CalibrationCard } from "./CalibrationCard";
import { PlaybookCard } from "./PlaybookCard";
import { beliefSlope } from "@/lib/intelligence/weatherLearner";
import type { WeatherScenarioInput, WeatherWhatIfResult } from "@/lib/intelligence/weatherWhatIf";
import { cn } from "@/lib/utils";

// Leaflet touches `window`/`document` at import time, so it must never be part of the server
// render — same reason components/twin/TwinCanvas.tsx dynamic-imports react-three-fiber.
const RegionalWeatherMap = dynamic(() => import("./RegionalWeatherMap").then((m) => m.RegionalWeatherMap), { ssr: false, loading: () => <div className="grid h-[420px] place-items-center rounded-xl border border-stroke bg-deep/70 text-[12px] text-low">Loading regional map…</div> });

/** HackCelestial 3.0 midnight task — Weather-Driven Digital Twin Enhancement. This page is the
 * one place all four mandatory pieces are visible together for a demo, but every one of them
 * is a real extension of the existing system, not a new standalone app:
 *  1. Live weather integration — forecastWeather()/weatherSource() (lib/intelligence/weather.ts)
 *     now actually drives the simulation tick (lib/sim/engine.ts), not only this card.
 *  2. Geospatial map — two complementary views: RegionalWeatherMap is a real lat/lng map (real
 *     basemap, live RainViewer radar, real regional entities, real GDACS hazard events) at the
 *     scale the brief's own "transportation, attraction demand" language describes; the
 *     property-internal WeatherImpactMap renders the same real zone geometry the 3D twin and
 *     the surveillance heatmap use, tinted by the live weather's actual per-zone effect.
 *  3. Real-world social signal integration — SocialSignalFeed, real Reddit/GNews data, feeding
 *     a concern score back into the same simulation (lib/intelligence/socialSignals.ts).
 *  4. What-if simulation — WeatherTwinPanel actually fast-forwards the real tick engine under
 *     two scenarios and reports the difference (lib/intelligence/weatherWhatIf.ts).
 */
export function WeatherTwinPage() {
  const { state } = useSim();
  useSim((s) => s.version);
  const forecast = forecastWeather(state);
  const liveWeather = weatherSource() === "live";
  const today = forecast[0];

  const [zoneMultiplier, setZoneMultiplier] = useState<Record<string, number>>({});
  const [whatIf, setWhatIf] = useState<{ scenario: WeatherScenarioInput; result: WeatherWhatIfResult } | null>(null);
  const [conditionLabel, setConditionLabel] = useState("Clear skies — no weather-driven demand shift.");

  return (
    <AnalyticsShell title="Weather Digital Twin" subtitle="An intelligent, continuously learning simulation layer over the existing resort twin — live weather and real public signal both feed the same simulation the rest of this dashboard already runs, and the what-if panel fast-forwards that same engine to show the cascade.">
      <Card
        title="7-day forecast"
        right={<span className={cn("mono rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider", liveWeather ? "bg-positive/15 text-positive" : "bg-white/5 text-low")}>{liveWeather ? "live · open-meteo" : "simulated"}</span>}
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {forecast.map((d) => (
            <div key={d.dayOffset} className={cn("flex min-w-[64px] flex-col items-center gap-1 rounded-md border px-2 py-2", d.condition === "rain" ? "border-sky-500/40 bg-sky-500/5" : d.condition === "heatwave" ? "border-warm/40 bg-warm/5" : "border-stroke bg-white/[0.02]")}>
              <span className="text-[9.5px] uppercase tracking-wider text-low">{d.dayOffset === 0 ? "Today" : `+${d.dayOffset}d`}</span>
              <span className="mono text-[14px] font-medium text-hi">{d.tempC}°C</span>
              <span className="text-[9.5px] text-mid">{d.condition === "rain" ? `${(d.rainProbability * 100).toFixed(0)}% rain` : d.condition === "heatwave" ? "heatwave" : "clear"}</span>
            </div>
          ))}
        </div>
      </Card>

      <RegionalWeatherMap />

      <div className="grid grid-cols-2 gap-4">
        <WeatherTwinPanel onResult={(scenario, zm, narrative, result) => { setZoneMultiplier(zm); setConditionLabel(narrative); setWhatIf({ scenario, result }); }} />
        <div className="flex flex-col gap-4">
          <Card title="Geospatial impact map (property zones)">
            <WeatherImpactMap zoneMultiplier={zoneMultiplier} conditionLabel={conditionLabel} />
          </Card>
          <SocialSignalFeed />
        </div>
      </div>

      <PlaybookCard />

      {whatIf && <CascadeGraph scenario={whatIf.scenario} result={whatIf.result} fnbSlope={beliefSlope(state)} />}
      <CalibrationCard />

      <p className="text-[10.5px] leading-relaxed text-low">
        Today&rsquo;s actual simulated weather ({today.condition}, {today.tempC}°C) is already shaping the live dashboard&rsquo;s own numbers on every other page — this page&rsquo;s what-if panel runs a separate, cloned projection to compare scenarios without touching that real state.
      </p>
    </AnalyticsShell>
  );
}
