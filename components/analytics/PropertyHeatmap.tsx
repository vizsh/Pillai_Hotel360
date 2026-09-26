"use client";

import { useMemo } from "react";
import { getModel } from "@/lib/architecture/model";

/** A 2D top-down property map in the same visual language as the 3D digital twin (dark glass
 * background, the same zone geometry the twin itself renders from — lib/architecture/generate.ts's
 * real `zones` array, not a redrawn mockup), used here to show WHERE crowd motion is live vs.
 * idle. Only one zone actually has a real camera feed today (this project has one supplied
 * crowd/altercation test clip) — that zone's tile intensity is driven by the real detector's
 * measured motion/people-count; every other zone is shown honestly dim/idle rather than
 * fabricating activity data for cameras that don't exist yet. */

const HEAT_STOPS = ["#0c4a6e", "#0891b2", "#f5a524", "#f4436c"]; // idle -> low -> medium -> hot

function heatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  const idx = clamped * (HEAT_STOPS.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(HEAT_STOPS.length - 1, i0 + 1);
  const t = idx - i0;
  const c0 = hexToRgb(HEAT_STOPS[i0]);
  const c1 = hexToRgb(HEAT_STOPS[i1]);
  const r = Math.round(c0.r + (c1.r - c0.r) * t);
  const g = Math.round(c0.g + (c1.g - c0.g) * t);
  const b = Math.round(c0.b + (c1.b - c0.b) * t);
  return `rgb(${r},${g},${b})`;
}
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function PropertyHeatmap({ liveZoneId, liveIntensity, liveLabel }: { liveZoneId: string; liveIntensity: number; liveLabel: string }) {
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
  const toSvg = (x: number, z: number) => ({
    x: PAD + (x - bounds.minX) * scale,
    y: PAD + (z - bounds.minZ) * scale,
  });

  return (
    <div className="rounded-lg border border-stroke bg-void/60 p-2">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ aspectRatio: `${VW}/${VH}` }}>
        <rect x={0} y={0} width={VW} height={VH} fill="#05070a" />
        {groundZones.map((z) => {
          const topLeft = toSvg(z.center[0] - z.w / 2, z.center[2] - z.d / 2);
          const w = z.w * scale;
          const h = z.d * scale;
          const isLive = z.id === liveZoneId;
          const fill = isLive ? heatColor(liveIntensity) : "#141a22";
          return (
            <g key={z.id}>
              <rect x={topLeft.x} y={topLeft.y} width={w} height={h} rx={3} fill={fill} stroke={isLive ? heatColor(Math.min(1, liveIntensity + 0.2)) : "#232a35"} strokeWidth={isLive ? 1.5 : 1} opacity={isLive ? 0.5 + liveIntensity * 0.5 : 0.6}>
                {isLive && <animate attributeName="opacity" values={`${0.4 + liveIntensity * 0.4};${0.65 + liveIntensity * 0.35};${0.4 + liveIntensity * 0.4}`} dur="1.6s" repeatCount="indefinite" />}
              </rect>
              <text x={topLeft.x + w / 2} y={topLeft.y + h / 2 - 3} textAnchor="middle" fontSize={9} fill={isLive ? "#fff" : "#7a8494"} className="mono" style={{ pointerEvents: "none" }}>
                {z.name}
              </text>
              <text x={topLeft.x + w / 2} y={topLeft.y + h / 2 + 9} textAnchor="middle" fontSize={7.5} fill={isLive ? "#ffe" : "#4a5261"} className="mono" style={{ pointerEvents: "none" }}>
                {isLive ? liveLabel : "no live feed"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[10px] text-low">
        <span>Idle</span>
        <div className="mx-2 h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${HEAT_STOPS.join(",")})` }} />
        <span>High traffic</span>
      </div>
    </div>
  );
}
