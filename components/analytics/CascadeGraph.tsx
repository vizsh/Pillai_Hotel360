"use client";

import { useMemo } from "react";
import type { MetricBand, WeatherScenarioInput, WeatherWhatIfResult } from "@/lib/intelligence/weatherWhatIf";
import { weatherDemandProfile } from "@/lib/intelligence/weatherImpact";
import { cn } from "@/lib/utils";

/** Cascade view of the what-if: which effect causes which, in what order, with how much certainty. Every
 * value is the Monte Carlo median from the same run the what-if panel shows; nothing here is separately
 * modelled. Edge weight and node border express signal-to-noise: how far the median sits from zero relative
 * to its P10-P90 spread. A dashed node means the band straddles zero (the effect is not distinguishable from
 * simulation noise at this run count) — the graph says so instead of drawing a confident arrow. */
interface NodeDef {
  id: string;
  order: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  title: string;
  band?: MetricBand;
  fmt?: (n: number) => string;
  unit?: string;
  /** true when a positive value is bad for the resort */
  badIfUp?: boolean;
  static?: string;
}

const W = 900;
const H = 380;
const NW = 190;
const NH = 66;

function snr(b?: MetricBand): number {
  if (!b) return 0.5;
  const spread = Math.max(1e-9, (b.p90 - b.p10) / 2);
  return Math.min(1, Math.abs(b.p50) / (Math.abs(b.p50) + spread));
}
const straddlesZero = (b?: MetricBand) => (b ? b.p10 < 0 && b.p90 > 0 : false);

const ORDER_LABEL = ["Trigger", "1st-order effect", "2nd-order effect", "3rd-order effect"];

export function CascadeGraph({ scenario, result, fnbSlope }: { scenario: WeatherScenarioInput; result: WeatherWhatIfResult; fnbSlope: number }) {
  const { nodes, edges } = useMemo(() => {
    const prof = weatherDemandProfile(scenario, { fnbSlope });
    const pool = result.zoneMultiplier["pool-deck"] ?? 1;
    const inr = (n: number) => (n < 0 ? "−" : "+") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
    const sg = (n: number, d = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d);
    const N: NodeDef[] = [
      { id: "wx", order: 0, x: 10, y: 157, title: scenario.condition === "clear" ? "Clear day" : scenario.condition === "rain" ? `Rain ${Math.round(scenario.rainProbability * 100)}%` : `Heatwave ${scenario.tempC}°C`, static: `${scenario.tempC}°C · ${Math.round(scenario.rainProbability * 100)}% rain` },
      { id: "outdoor", order: 1, x: 235, y: 20, title: "Outdoor / pool-side demand", static: `${pool >= 1 ? "+" : "−"}${Math.abs(Math.round((pool - 1) * 100))}% pool-deck`, badIfUp: false },
      { id: "fnb", order: 1, x: 235, y: 157, title: "Indoor F&B & spa demand", band: result.fnbDemandDelta, fmt: (n) => inr(n) },
      { id: "presence", order: 1, x: 235, y: 294, title: "Guests stay in their rooms", static: `+${Math.round(prof.daytimePresenceBump * 100)} pts daytime presence` },
      { id: "reqs", order: 2, x: 460, y: 88, title: "F&B / concierge requests", band: result.openFnbConciergeRequestsDelta, fmt: (n) => sg(n), badIfUp: true },
      { id: "energy", order: 2, x: 460, y: 250, title: "Room energy load", band: result.energyDelta, fmt: (n) => sg(n, 0), unit: " kWh", badIfUp: true },
      { id: "staff", order: 3, x: 685, y: 88, title: "Unmet staffing", band: result.staffingUnmetDelta, fmt: (n) => sg(n), unit: " shifts", badIfUp: true },
      { id: "hvac", order: 3, x: 685, y: 250, title: "HVAC failure risk", band: { p10: result.hvacRiskDelta.p10 * 100, p50: result.hvacRiskDelta.p50 * 100, p90: result.hvacRiskDelta.p90 * 100 }, fmt: (n) => sg(n), unit: " pp", badIfUp: true },
    ];
    const E: [string, string, string?][] = [
      ["wx", "outdoor"],
      ["wx", "fnb"],
      ["wx", "presence"],
      ["outdoor", "fnb", "shift indoors"],
      ["fnb", "reqs"],
      ["presence", "energy"],
      ["reqs", "staff"],
      ["energy", "hvac"],
    ];
    if (scenario.condition === "heatwave") E.push(["wx", "energy", "AC load"]);
    return { nodes: N, edges: E };
  }, [scenario, result, fnbSlope]);

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stroke bg-deep/70 p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-[14.5px] font-semibold text-hi">Cascade of effects</span>
        <span className="mono rounded bg-white/5 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-low">modeled · from the same Monte Carlo run</span>
      </div>
      <p className="text-[11px] leading-relaxed text-mid">
        How this weather propagates through the property, in order. Arrow weight and node border show confidence: a solid node is a median clearly away from zero; a <span className="text-hi">dashed</span> node has a P10–P90 band that includes zero, so the twin does not claim the effect.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cascade graph of weather effects">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#c9932a" />
          </marker>
        </defs>
        {["Trigger", "1st order", "2nd order", "3rd order"].map((t, i) => (
          <text key={t} x={[105, 330, 555, 780][i]} y={12} textAnchor="middle" className="fill-[#7a8494]" style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>
            {t}
          </text>
        ))}
        {edges.map(([a, b, label], i) => {
          const from = byId[a];
          const to = byId[b];
          const s = Math.max(0.25, snr(to.band ?? from.band));
          const x1 = from.x + NW;
          const y1 = from.y + NH / 2;
          const x2 = to.x - 4;
          const y2 = to.y + NH / 2;
          const mx = (x1 + x2) / 2;
          return (
            <g key={`${a}-${b}-${i}`}>
              <path d={`M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke="#c9932a" strokeWidth={1 + s * 3.2} opacity={0.25 + s * 0.6} markerEnd="url(#arrow)" />
              {label && (
                <text x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="fill-[#7a8494]" style={{ fontSize: 9.5, fontStyle: "italic" }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const dashed = straddlesZero(n.band);
          const val = n.band && n.fmt ? n.fmt(n.band.p50) + (n.unit ?? "") : n.static;
          const bad = n.band ? (n.badIfUp ? n.band.p50 > 0 : n.band.p50 < 0) && !dashed : false;
          const good = n.band ? (n.badIfUp ? n.band.p50 < 0 : n.band.p50 > 0) && !dashed : false;
          const color = n.order === 0 ? "#f5a524" : bad ? "#f4436c" : good ? "#34d399" : "#7a8494";
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={NW} height={NH} rx={9} fill="#0f151d" stroke={color} strokeWidth={n.order === 0 ? 2.2 : 1.6} strokeDasharray={dashed ? "5 4" : undefined} />
              <text x={n.x + 10} y={n.y + 17} className="fill-[#7a8494]" style={{ fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase" }}>
                {ORDER_LABEL[n.order]}
              </text>
              <text x={n.x + 10} y={n.y + 33} className="fill-[#e6edf5]" style={{ fontSize: 11.5, fontWeight: 600 }}>
                {n.title}
              </text>
              <text x={n.x + 10} y={n.y + 52} fill={color} style={{ fontSize: 13, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>
                {val}
              </text>
              {n.band && n.fmt && (
                <text x={n.x + NW - 8} y={n.y + 52} textAnchor="end" className="fill-[#7a8494]" style={{ fontSize: 8.5, fontFamily: "ui-monospace, monospace" }}>
                  {n.fmt(n.band.p10)} … {n.fmt(n.band.p90)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className={cn("mono text-[9.5px] leading-relaxed text-low")}>
        Numbers are the median change versus an otherwise-identical clear day over the next {result.horizonHours} h ({result.runs} runs); grey range = P10…P90. The F&B slope used is the twin&rsquo;s learned belief ({fnbSlope.toFixed(2)}).
      </p>
    </div>
  );
}
