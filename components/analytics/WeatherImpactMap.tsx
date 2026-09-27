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

  // Presentation-only sizing helpers (no effect on zoneMultiplier or any simulation value):
  // some zones (e.g. F&B Store, Housekeeping Store) are genuinely narrow relative to the
  // property's overall footprint, so a fixed-size two-line label was overflowing its own rect
  // and overlapping the neighbouring zone's text. Below a size threshold the label shrinks to
  // just the name, then to a truncated name, then (if there's truly no room) to nothing visible
  // — a <title> tooltip always carries the full name + exact reading regardless, so no
  // information is lost, only decluttered.
  const truncate = (text: string, maxChars: number) => (text.length <= maxChars ? text : text.slice(0, Math.max(1, maxChars - 1)) + "…");

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
          const detail = affected ? `demand ${pct > 0 ? "+" : ""}${pct}%` : "no effect";

          const nameSize = w < 46 ? 7 : 9;
          const detailSize = 7.5;
          const showDetail = h >= 30 && w >= 40;
          const showName = h >= 16 && w >= 22;
          const nameMaxChars = Math.max(3, Math.floor((w - 4) / (nameSize * 0.62)));
          const detailMaxChars = Math.max(3, Math.floor((w - 4) / (detailSize * 0.62)));
          const clipId = `clip-${z.id}`;

          return (
            <g key={z.id}>
              <title>
                {z.name} — {detail}
              </title>
              <clipPath id={clipId}>
                <rect x={topLeft.x} y={topLeft.y} width={w} height={h} rx={3} />
              </clipPath>
              <rect x={topLeft.x} y={topLeft.y} width={w} height={h} rx={3} fill={multiplierColor(m)} stroke={affected ? multiplierColor(m > 1 ? Math.min(1.6, m + 0.15) : Math.max(0.4, m - 0.15)) : "#232a35"} strokeWidth={affected ? 1.5 : 1} opacity={affected ? 0.85 : 0.55} />
              <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
                {showName && (
                  <text x={topLeft.x + w / 2} y={topLeft.y + h / 2 + (showDetail ? -3 : 3)} textAnchor="middle" fontSize={nameSize} fill={affected ? "#fff" : "#7a8494"} className="mono">
                    {truncate(z.name, nameMaxChars)}
                  </text>
                )}
                {showDetail && (
                  <text x={topLeft.x + w / 2} y={topLeft.y + h / 2 + 9} textAnchor="middle" fontSize={detailSize} fill={affected ? "#ffe" : "#4a5261"} className="mono">
                    {truncate(detail, detailMaxChars)}
                  </text>
                )}
              </g>
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
