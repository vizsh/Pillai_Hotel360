"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudRain, Sun, Thermometer, X } from "lucide-react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { runWeatherWhatIf, type WeatherScenarioInput, type MetricBand } from "@/lib/intelligence/weatherWhatIf";
import { fmtINR, cn } from "@/lib/utils";
import { Provenance } from "@/components/ui/primitives";

const PRESETS: { label: string; icon: typeof Sun; scenario: WeatherScenarioInput }[] = [
  { label: "Clear", icon: Sun, scenario: { condition: "clear", tempC: 28, rainProbability: 0.1 } },
  { label: "Light rain", icon: CloudRain, scenario: { condition: "rain", tempC: 25, rainProbability: 0.55 } },
  { label: "Heavy storm", icon: CloudRain, scenario: { condition: "rain", tempC: 23, rainProbability: 0.95 } },
  { label: "Heatwave", icon: Thermometer, scenario: { condition: "heatwave", tempC: 39, rainProbability: 0.02 } },
];

/** Every number below comes from actually fast-forwarding the real simulation tick twice per
 * sample (once under this scenario's weather, once under clear weather, same production code
 * — lib/intelligence/weatherWhatIf.ts) rather than a hand-authored formula, so this is genuinely
 * slower than a normal what-if (real work, not a lookup) — debounced rather than recomputed on
 * every pixel of slider movement, with an explicit "computing" state so that's honest on
 * screen instead of the panel looking frozen. */
function DeltaRow({ label, sub, band, fmt, unit, betterIsHigher }: { label: string; sub?: string; band: MetricBand; fmt: (n: number) => string; unit?: string; betterIsHigher: boolean }) {
  const improved = betterIsHigher ? band.p50 > 0 : band.p50 < 0;
  const worse = betterIsHigher ? band.p50 < 0 : band.p50 > 0;
  return (
    <div className="flex items-center justify-between rounded-lg border border-stroke bg-white/[0.02] px-3 py-2.5">
      <div>
        <div className="text-[12px] text-hi">{label}</div>
        {sub && <div className="text-[10.5px] text-low">{sub}</div>}
      </div>
      <div className="text-right">
        <div className={cn("mono text-[15px] font-medium", improved ? "text-positive" : worse ? "text-critical" : "text-hi")}>
          {band.p50 >= 0 ? "+" : ""}
          {fmt(band.p50)}
          {unit}
        </div>
        <div className="mono text-[9.5px] text-low">
          range {fmt(band.p10)} to {fmt(band.p90)}
          {unit}
        </div>
      </div>
    </div>
  );
}

export function WeatherTwinPanel({ onResult, onClose }: { onResult?: (scenario: WeatherScenarioInput, zoneMultiplier: Record<string, number>, conditionLabel: string) => void; onClose?: () => void }) {
  const { state } = useSim();
  useSim((s) => s.version);
  const model = getModel();

  const [preset, setPreset] = useState(1);
  const [draft, setDraft] = useState<WeatherScenarioInput>(PRESETS[1].scenario);
  const [committed, setCommitted] = useState<WeatherScenarioInput>(PRESETS[1].scenario);
  // Derived, not stateful: `committed` is only ever reassigned to the exact `draft` object the
  // debounce below was scheduled from, so once it lands they're the same reference and this
  // goes false on its own — no separate "computing" state to keep in sync (and no setState
  // inside an effect body or a useMemo, which is what the two lines this replaced did).
  const computing = draft !== committed;

  useEffect(() => {
    const id = setTimeout(() => setCommitted(draft), 450);
    return () => clearTimeout(id);
  }, [draft]);

  const result = useMemo(() => runWeatherWhatIf(state, model, committed), [state, model, committed]);

  useEffect(() => {
    onResult?.(committed, result.zoneMultiplier, result.narrative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#f5a524]/30 bg-deep/70 p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-[14.5px] font-semibold text-hi">Weather Digital Twin — what if?</span>
        <div className="flex items-center gap-1.5">
          <Provenance kind="modeled" />
          {onClose && (
            <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-low hover:bg-white/5 hover:text-hi" aria-label="Close">
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-mid">
        Fast-forwards {result.horizonHours}h of the real simulation ({result.runs} independent runs) under this weather versus an otherwise-identical clear day, and reports the difference — not a formula, the actual production tick engine run twice.
      </p>

      <div className="flex gap-1.5">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => {
              setPreset(i);
              setDraft(p.scenario);
            }}
            className={cn("flex flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-[10.5px] transition-colors", preset === i ? "border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524]" : "border-stroke text-low hover:text-hi")}
          >
            <p.icon size={11} />
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10.5px] text-low">
            <span>Rain probability</span>
            <span className="mono">{Math.round(draft.rainProbability * 100)}%</span>
          </div>
          <input type="range" min={0} max={100} value={Math.round(draft.rainProbability * 100)} onChange={(e) => { setPreset(-1); setDraft((d) => ({ ...d, rainProbability: Number(e.target.value) / 100, condition: Number(e.target.value) >= 50 ? "rain" : d.condition === "heatwave" ? "heatwave" : "clear" })); }} className="w-full accent-[#f5a524]" aria-label="Rain probability" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[10.5px] text-low">
            <span>Temperature</span>
            <span className="mono">{draft.tempC}°C</span>
          </div>
          <input type="range" min={20} max={42} value={draft.tempC} onChange={(e) => { setPreset(-1); const tempC = Number(e.target.value); setDraft((d) => ({ ...d, tempC, condition: tempC >= 34 ? "heatwave" : d.rainProbability >= 0.5 ? "rain" : "clear" })); }} className="w-full accent-[#f5a524]" aria-label="Temperature" />
        </div>
      </div>

      <div className={cn("rounded-lg border px-3 py-2 text-[11px] leading-relaxed transition-opacity", computing ? "opacity-50" : "opacity-100", result.scenario.condition === "clear" ? "border-stroke text-mid" : "border-[#f5a524]/30 bg-[#f5a524]/5 text-hi")}>
        {computing ? "Computing…" : result.narrative}
      </div>

      <div className="flex flex-col gap-2">
        <DeltaRow label="Occupancy" band={result.occupancyDelta} fmt={(n) => (n * 100).toFixed(1)} unit="pp" betterIsHigher />
        <DeltaRow label="F&B demand" sub="Organic guest spend generated over the horizon" band={result.fnbDemandDelta} fmt={(n) => fmtINR(Math.abs(n)).replace("₹", n < 0 ? "-₹" : "₹")} betterIsHigher />
        <DeltaRow label="Room energy load" sub="Sum of live per-room energy state" band={result.energyDelta} fmt={(n) => n.toFixed(0)} unit=" kWh" betterIsHigher={false} />
        <DeltaRow label="Unmet staffing (shifts)" sub="Same roster solver as Operations" band={result.staffingUnmetDelta} fmt={(n) => n.toFixed(1)} betterIsHigher={false} />
        <DeltaRow label="HVAC failure risk" sub="Avg. chiller/AHU 7-day risk" band={result.hvacRiskDelta} fmt={(n) => (n * 100).toFixed(1)} unit="pp" betterIsHigher={false} />
        <DeltaRow label="Open F&B/concierge requests" band={result.openFnbConciergeRequestsDelta} fmt={(n) => n.toFixed(1)} betterIsHigher={false} />
      </div>
    </div>
  );
}
