"use client";

import { useEffect, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";
import { useThree } from "@react-three/fiber";
import { useTwin, type Selection, type ViewMode } from "@/store/twin";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { defaultConfig } from "@/lib/architecture/config";
import { floorY } from "@/lib/architecture/generate";
import { EXPLODE_GAP } from "./FloorGroup";

export const cameraRef: { current: CameraControlsImpl | null } = { current: null };

type Look = [number, number, number, number, number, number];

export function presetFor(mode: ViewMode, isolatedFloor: number | null): Look {
  const m = getModel();
  const H = m.dims.height;
  const L = m.dims.length;
  switch (mode) {
    case "orbit":
      return [L * 1.1, H * 1.6, -L * 1.25, 0, H * 0.42, -6];
    case "exploded": {
      const top = H + m.floors.length * EXPLODE_GAP;
      return [L * 1.7, top * 0.85, -L * 1.7, 0, top * 0.48, 0];
    }
    case "isolate":
    case "room": {
      const f = isolatedFloor ?? 3;
      const y = floorY(defaultConfig, f);
      return [L * 0.55, y + 34, -L * 0.75, 0, y + 1, 0];
    }
    case "xray":
      return [L * 0.9, H * 0.9, -L * 0.95, 0, H * 0.45, 0];
    case "top":
      return [0, H + 125, -6.05, 0, H * 0.3, -6];
    case "facade":
      return [8, H * 0.55, -L * 1.6, 0, H * 0.5, 0];
    case "site":
      return [L * 2.2, H * 2.6, -L * 2.4, 0, 0, -30];
  }
}

export function lookForSelection(sel: Selection, viewMode: ViewMode, isolatedFloor: number | null): Look | null {
  const m = getModel();
  const yOff = (f: number) => (viewMode === "exploded" ? f * EXPLODE_GAP : 0);
  if (sel.kind === "room") {
    const r = m.roomById.get(sel.id);
    if (!r) return null;
    const y = r.center[1] + yOff(r.floor);
    if (viewMode === "room") {
      const f = r.facing;
      // Inset from the back (exterior) wall by enough to clear the camera's 0.5-unit near
      // clip plane with margin — at the old 0.6 inset, a room a little smaller than
      // average (or furniture placed hard against that wall) could put the wall itself
      // inside the near plane, which reads as a blank/grey frame since everything in front
      // of it gets clipped away.
      const wallClearance = Math.min(r.d * 0.32, 1.8);
      // Target sits low (near furniture height, not eye height) so the shot pitches down
      // across the bed/desk instead of skimming the ceiling — a level target at this
      // camera distance mostly framed the back wall.
      return [r.center[0] - r.w * 0.28, y + 1.65, r.center[2] - f * (r.d / 2 - wallClearance), r.center[0] + r.w * 0.1, y + 0.55, r.center[2] + f * r.d * 0.45];
    }
    if (viewMode === "isolate" && isolatedFloor === r.floor) return [r.center[0] + 10, y + 16, r.center[2] - r.facing * 14, r.center[0], y + 1, r.center[2]];
    return [r.center[0] + 10, y + 12, r.center[2] + r.facing * 30, r.center[0], y + 1, r.center[2]];
  }
  if (sel.kind === "asset") {
    const a = m.assetById.get(sel.id);
    if (!a) return null;
    const y = a.position[1] + yOff(a.floor);
    const roof = a.floor >= m.floors.length;
    const dx = a.position[0] < 0 ? -1 : 1;
    return [a.position[0] + dx * (roof ? 22 : 12), y + (roof ? 16 : 9), a.position[2] - (roof ? 26 : 14), a.position[0], y, a.position[2]];
  }
  if (sel.kind === "zone") {
    const z = m.zoneById.get(sel.id);
    if (!z) return null;
    const y = z.center[1] + yOff(z.floor);
    return [z.center[0] + 18, y + 22, z.center[2] - 24, z.center[0], y + 1, z.center[2]];
  }
  if (sel.kind === "staff") {
    const s = useTwinStaffPos(sel.id);
    if (!s) return null;
    return [s[0] + 8, s[1] + 7 + yOff(s[3]), s[2] - 8, s[0], s[1] + 1 + yOff(s[3]), s[2]];
  }
  return null;
}

function useTwinStaffPos(id: string): [number, number, number, number] | null {
  const s = useSim.getState().state.staff[id];
  return s ? [s.position[0], s.position[1], s.position[2], s.floor] : null;
}

export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null!);
  const { invalidate } = useThree();

  useEffect(() => {
    cameraRef.current = ref.current;
    const c = ref.current;
    c.minDistance = 2;
    c.maxDistance = 420;
    c.maxPolarAngle = Math.PI * 0.495;
    c.smoothTime = 0.55;
    c.draggingSmoothTime = 0.12;
    c.dollyToCursor = true;
    c.infinityDolly = false;
    c.setLookAt(...presetFor("orbit", null), false);
    return () => {
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    const unsub = useTwin.subscribe(
      (s) => [s.viewMode, s.isolatedFloor, s.selected] as const,
      ([mode, floor, sel], [prevMode, prevFloor, prevSel]) => {
        const c = ref.current;
        if (!c) return;
        const modeChanged = mode !== prevMode || floor !== prevFloor;
        const selChanged = sel !== prevSel;
        if (mode === "room") {
          if (sel?.kind === "room") {
            const r = getModel().roomById.get(sel.id);
            if (r && floor !== r.floor) {
              useTwin.setState({ isolatedFloor: r.floor });
              return;
            }
            const look = lookForSelection(sel, mode, floor);
            if (look) c.setLookAt(...look, true);
          } else if (modeChanged) c.setLookAt(...presetFor("isolate", floor), true);
          invalidate();
          return;
        }
        if (selChanged && sel) {
          const look = lookForSelection(sel, mode, floor);
          if (look) c.setLookAt(...look, true);
        } else if (modeChanged) {
          c.setLookAt(...presetFor(mode, floor), true);
        }
        invalidate();
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] },
    );
    return unsub;
  }, [invalidate]);

  return <CameraControls ref={ref} makeDefault />;
}
