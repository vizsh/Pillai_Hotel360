"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTwin, type LayerId, type ViewMode } from "@/store/twin";
import { cameraRef, presetFor } from "./CameraRig";
import { getModel } from "@/lib/architecture/model";

interface Beat {
  mode: ViewMode;
  layer: LayerId;
  floor?: number;
  hold: number;
  look?: [number, number, number, number, number, number];
  showStaff?: boolean;
  showGuests?: boolean;
}

function beats(): Beat[] {
  const m = getModel();
  const L = m.dims.length;
  const H = m.dims.height;
  return [
    { mode: "site", layer: "occupancy", hold: 6, look: [L * 2.4, H * 2.2, -L * 2.6, 0, 4, -30] },
    { mode: "orbit", layer: "occupancy", hold: 7 },
    { mode: "facade", layer: "revenue", hold: 6, look: [-L * 0.4, H * 0.5, -L * 1.5, 0, H * 0.5, 0] },
    { mode: "xray", layer: "maintenance", hold: 7 },
    { mode: "exploded", layer: "sentiment", hold: 8, showGuests: true },
    { mode: "isolate", layer: "housekeeping", floor: 4, hold: 7, showStaff: true },
    { mode: "top", layer: "energy", hold: 6 },
    { mode: "orbit", layer: "occupancy", hold: 6, look: [-L * 1.2, H * 1.3, L * 0.9, 0, H * 0.4, 0] },
  ];
}

export function Tour() {
  const idx = useRef(0);
  const timer = useRef(0);
  const prevMode = useRef<ViewMode | null>(null);

  useEffect(() => {
    return useTwin.subscribe(
      (s) => s.tourPlaying,
      (playing) => {
        if (playing) {
          idx.current = -1;
          timer.current = 0;
        }
      },
    );
  }, []);

  useFrame((_, dt) => {
    const t = useTwin.getState();
    if (!t.tourPlaying) {
      prevMode.current = null;
      return;
    }
    const list = beats();
    timer.current -= dt;
    if (timer.current <= 0) {
      idx.current = (idx.current + 1) % list.length;
      const b = list[idx.current];
      timer.current = b.hold;
      useTwin.setState({ viewMode: b.mode, isolatedFloor: b.floor ?? (b.mode === "isolate" ? 4 : null), activeLayer: b.layer, selected: null, showGuests: b.showGuests ?? false, showStaff: b.showStaff ?? true });
      const c = cameraRef.current;
      if (c) {
        const look = b.look ?? presetFor(b.mode, b.floor ?? null);
        c.setLookAt(...look, true);
      }
    } else {
      const c = cameraRef.current;
      const b = list[idx.current];
      if (c && b && (b.mode === "orbit" || b.mode === "xray" || b.mode === "site")) c.rotate(dt * 0.06, 0, false);
    }
  });
  return null;
}

export function IdleOrbit() {
  const idle = useRef(0);
  useEffect(() => {
    const reset = () => (idle.current = 0);
    window.addEventListener("pointerdown", reset);
    window.addEventListener("wheel", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("wheel", reset);
      window.removeEventListener("keydown", reset);
    };
  }, []);
  useFrame((_, dt) => {
    const t = useTwin.getState();
    if (t.tourPlaying || t.viewMode !== "orbit" || t.selected) {
      idle.current = 0;
      return;
    }
    idle.current += dt;
    if (idle.current > 10 && cameraRef.current) cameraRef.current.rotate(dt * 0.025, 0, false);
  });
  return null;
}
