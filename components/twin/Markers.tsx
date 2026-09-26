"use client";

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { useProfile } from "@/store/quality";
import { getModel } from "@/lib/architecture/model";
import { floorY } from "@/lib/architecture/generate";
import { defaultConfig } from "@/lib/architecture/config";
import type { Alert } from "@/lib/sim/types";
import { severityColors } from "@/lib/twin/colors";
import { EXPLODE_GAP } from "./FloorGroup";
import { cn } from "@/lib/utils";

function targetPosition(a: Pick<Alert, "targetKind" | "targetId">, viewMode: string): [number, number, number] | null {
  const m = getModel();
  const yOff = (f: number) => (viewMode === "exploded" ? f * EXPLODE_GAP : 0);
  if (a.targetKind === "room") {
    const r = m.roomById.get(a.targetId);
    if (!r) return null;
    return [r.center[0], r.center[1] + r.h + 0.4 + yOff(r.floor), r.center[2]];
  }
  if (a.targetKind === "asset") {
    const as = m.assetById.get(a.targetId);
    if (!as) return null;
    return [as.position[0], as.position[1] + as.size[1] / 2 + 1 + yOff(as.floor), as.position[2]];
  }
  if (a.targetKind === "inventory") {
    const st = useSim.getState().state.inventory[a.targetId];
    const z = st ? m.zoneById.get(st.storeZone) : null;
    if (!z) return null;
    return [z.center[0], z.center[1] + 4, z.center[2]];
  }
  if (a.targetKind === "zone") {
    const z = m.zoneById.get(a.targetId);
    if (!z) return null;
    return [z.center[0], z.center[1] + 4 + yOff(z.floor), z.center[2]];
  }
  return null;
}

export function Markers() {
  const version = useSim((s) => s.version);
  const { showAlerts, showLabels, viewMode, isolatedFloor, selected, hovered, highlighted } = useTwin();
  const cap = useProfile().labelsCap;
  const model = getModel();

  const highlightMarks = useMemo(() => {
    void version;
    return highlighted
      .map((id) => ({ id, pos: targetPosition({ targetKind: "room", targetId: id }, viewMode) }))
      .filter((x): x is { id: string; pos: [number, number, number] } => !!x.pos);
  }, [version, highlighted, viewMode]);

  const alerts = useMemo(() => {
    void version;
    if (!showAlerts) return [];
    const st = useSim.getState().state;
    const order = { critical: 0, warn: 1, info: 2 };
    return Object.values(st.alerts)
      .filter((a) => !a.resolvedAt)
      .sort((a, b) => order[a.severity] - order[b.severity] || b.createdAt - a.createdAt)
      .slice(0, cap)
      .map((a) => ({ a, pos: targetPosition(a, viewMode) }))
      .filter((x): x is { a: Alert; pos: [number, number, number] } => !!x.pos)
      .filter(({ a }) => {
        if ((viewMode === "isolate" || viewMode === "room") && isolatedFloor !== null) {
          const f = a.targetKind === "room" ? model.roomById.get(a.targetId)?.floor : a.targetKind === "asset" ? model.assetById.get(a.targetId)?.floor : 0;
          return f !== undefined && f <= isolatedFloor;
        }
        return true;
      });
  }, [version, showAlerts, viewMode, isolatedFloor, cap, model]);

  const focus = selected ?? hovered;
  const focusPos = focus && (focus.kind === "room" || focus.kind === "asset" || focus.kind === "zone") ? targetPosition({ targetKind: focus.kind, targetId: focus.id }, viewMode) : null;
  const focusLabel = (() => {
    if (!focus) return null;
    const st = useSim.getState().state;
    if (focus.kind === "room") {
      const r = model.roomById.get(focus.id);
      const rs = st.rooms[focus.id];
      const g = rs?.guestId ? st.guests[rs.guestId] : null;
      return r ? `${r.number} · ${r.type}${g ? ` · ${g.name}` : ` · ${rs.status.replace("-", " ")}`}` : null;
    }
    if (focus.kind === "asset") {
      const a = model.assetById.get(focus.id);
      const as = st.assets[focus.id];
      return a ? `${a.name} · ${as ? `${(as.failureProb7d * 100).toFixed(0)}% risk` : ""}` : null;
    }
    if (focus.kind === "zone") return model.zoneById.get(focus.id)?.name ?? null;
    return null;
  })();

  return (
    <>
      {alerts.map(({ a, pos }) => (
        <Html key={a.id} position={pos} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              useTwin.getState().select({ kind: a.targetKind === "inventory" ? "zone" : (a.targetKind as "room" | "asset" | "zone"), id: a.targetKind === "inventory" ? (useSim.getState().state.inventory[a.targetId]?.storeZone ?? "") : a.targetId });
            }}
            className="group pointer-events-auto flex -translate-y-1/2 items-center gap-1.5"
            style={{ ["--c" as string]: severityColors[a.severity] }}
          >
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: "var(--c)", animation: "pulse-ring 1.6s ease-out infinite" }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--c)", boxShadow: "0 0 8px var(--c)" }} />
            </span>
            {showLabels && (
              <span className="mono max-w-[180px] truncate rounded-md border px-1.5 py-0.5 text-[10px] tracking-wide text-hi opacity-90 backdrop-blur-md transition-opacity group-hover:opacity-100" style={{ borderColor: "var(--c)", background: "rgba(5,7,10,0.72)" }}>
                {a.title}
              </span>
            )}
          </button>
        </Html>
      ))}
      {highlightMarks.map(({ id, pos }) => (
        <Html key={`ask-${id}`} position={pos} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: "#c084fc", animation: "pulse-ring 1.1s ease-out infinite" }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "#c084fc", boxShadow: "0 0 12px #c084fc" }} />
          </span>
        </Html>
      ))}
      {focusPos && focusLabel && (
        <Html position={[focusPos[0], focusPos[1] + 0.6, focusPos[2]]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div className={cn("mono whitespace-nowrap rounded-md border border-accent/60 bg-void/80 px-2 py-1 text-[11px] text-hi backdrop-blur-md", selected ? "shadow-[0_0_16px_rgba(45,212,191,0.35)]" : "opacity-80")}>{focusLabel}</div>
        </Html>
      )}
    </>
  );
}
