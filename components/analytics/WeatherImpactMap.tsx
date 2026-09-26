"use client";

import { useMemo } from "react";
import { getModel } from "@/lib/architecture/model";
import type { ZoneKind } from "@/lib/architecture/types";

/** The geospatial visualization the weather digital-twin task asks for: the same real
 * zone geometry the 3D twin and the surveillance heatmap both render from
 * (lib/architecture/generate.ts's `zones`), this time tinted by
 * lib/intelligence/weatherImpact.ts's actual per-zone demand multiplier for the currently
 * selected scenario — the map's colours are the literal numbers driving the simulation, not a
 * separately illustrated guess. A multiplier of 1 (no data for that zone kind) renders neutral;
 * below 1 (demand falling — a rained-out pool deck) renders cool/blue; above 1 (demand rising —
 * a rain-driven restaurant surge) renders warm/red. Deliberately a different component from
 * components/analytics/PropertyHeatmap.tsx (which is a single real camera feed's live crowd
 * intensity) rather than repurposing it — the two show different, non-interchangeable kinds of
 * "hot", and conflating them would misrepresent the surveillance feed as weather-driven or
 * vice versa. */

const COOL = { r: 12, g: 74, b: 110 }; // demand falling
const NEUTRAL_COLOR = { r: 26, g: 32, b: 41 }; // no weather effect on this zone kind
const WARM = { r: 244, g: 67, b: 108 }; // demand rising

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
function multiplierColor(m: number): string {
  if (m >= 1) {
    const t = Math.min(1, (m - 1) / 0.6);
    return `rgb(${lerp(NEUTRAL_COLOR.r, WARM.r, t)},${lerp(NEUTRAL_COLOR.g, WARM.g, t)},${lerp(NEUTRAL_COLOR.b, WARM.b, t)})`;
  }
  const t = Math.min(1, (1 - m) / 0.6);
  return `rgb(${lerp(NEUTRAL_COLOR.r, COOL.r, t)},${lerp(NEUTRAL_COLOR.g, COOL.g, t)},${lerp(NEUTRAL_COLOR.b, COOL.b, t)})`;
}

export function WeatherImpactMap({ zoneMultiplier, conditionLabel }: { zoneMultiplier: Partial<Record<ZoneKind, number>>; conditionLabel: string }) {
  const model = getModel();
  const groundZones = useMemo(() => model.zones.filter((z) => z.floor === 0), [model]);

  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const z of groundZones) {
      minX = Math.min(minX, z.center[0] - z.w / 2);
      maxX = Math.max(maxX, z.center[0] + z.w / 2);
      minZ = Math.min(minZ, z.center[2] - z.d / 2);
      maxZ = Math.max(maxZ, z.center[2] + z.d / 2);
    }
    return { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ };
  }, [groundZones]);

  const PAD = 20;
  const VW = 400;
  const VH = 260;
  const scale = Math.min((VW - PAD * 2) / bounds.w, (VH - PAD * 2) / bounds.h);
  const toSvg = (x: number, z: number) => ({ x: PAD + (x - bounds.minX) * scale, y: PAD + (z - bounds.minZ) * scale });

  return (
    <div className="rounded-lg border border-stroke bg-void/60 p-2">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ aspectRatio: `${VW}/${VH}` }}>
        <rect x={0} y={0} width={VW} height={VH} fill="#05070a" />
        {groundZones.map((z) => {
          const topLeft = toSvg(z.center[0] - z.w / 2, z.center[2] - z.d / 2);
          const w = z.w * scale;
          const h = z.d * scale;
          const m = zoneMultiplier[z.kind] ?? 1;
          const affected = Math.abs(m - 1) > 0.02;
          const pct = Math.round((m - 1) * 100);
          return (
            <g key={z.id}>
              <rect x={topLeft.x} y={topLeft.y} width={w} height={h} rx={3} fill={multiplierColor(m)} stroke={affected ? multiplierColor(m > 1 ? Math.min(1.6, m + 0.15) : Math.max(0.4, m - 0.15)) : "#232a35"} strokeWidth={affected ? 1.5 : 1} opacity={affected ? 0.85 : 0.55} />
              <text x={topLeft.x + w / 2} y={topLeft.y + h / 2 - 3} textAnchor="middle" fontSize={9} fill={affected ? "#fff" : "#7a8494"} className="mono" style={{ pointerEvents: "none" }}>
                {z.name}
              </text>
              <text x={topLeft.x + w / 2} y={topLeft.y + h / 2 + 9} textAnchor="middle" fontSize={7.5} fill={affected ? "#ffe" : "#4a5261"} className="mono" style={{ pointerEvents: "none" }}>
                {affected ? `demand ${pct > 0 ? "+" : ""}${pct}%` : "no effect"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[10px] text-low">
        <span>{conditionLabel}</span>
        <div className="flex items-center gap-2">
          <span>Demand falling</span>
          <div className="h-1.5 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${multiplierColor(0.4)}, ${multiplierColor(1)}, ${multiplierColor(1.6)})` }} />
          <span>Demand rising</span>
        </div>
      </div>
    </div>
  );
}
