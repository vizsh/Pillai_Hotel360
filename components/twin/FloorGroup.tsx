"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";

interface FloorCtx {
  floor: number;
  register: (m: THREE.Material) => () => void;
}

const Ctx = createContext<FloorCtx | null>(null);

export const useFloorCtx = () => useContext(Ctx);

export const EXPLODE_GAP = 6;

export function floorTargets(floor: number, totalFloors: number) {
  const { viewMode, isolatedFloor } = useTwin.getState();
  const isRoof = floor >= totalFloors;
  let yOff = 0;
  let opacity: Record<string, number> = { default: 1 };
  let visible = true;
  if (viewMode === "exploded") yOff = floor * EXPLODE_GAP;
  if ((viewMode === "isolate" || viewMode === "room") && isolatedFloor !== null) {
    if (floor > isolatedFloor) {
      visible = false;
      opacity = { default: 0 };
    } else if (floor < isolatedFloor) {
      opacity = { default: 0.12, glass: 0.04, plate: 0.25 };
    } else {
      opacity = { default: 1, glass: 0.1 };
    }
  }
  if (viewMode === "xray") opacity = { default: 0.28, glass: 0.06, plate: 1, furniture: 0.6, slab: 0.35 };
  if (viewMode === "top") {
    if (isRoof) {
      visible = false;
      opacity = { default: 0 };
    } else opacity = { default: 1, glass: 0.08 };
  }
  return { yOff, opacity, visible };
}

export function FloorGroup({ floor, baseY, children }: { floor: number; baseY: number; children: ReactNode }) {
  const group = useRef<THREE.Group>(null!);
  const mats = useRef(new Set<THREE.Material>());
  const total = getModel().floors.length;
  const ctx = useMemo<FloorCtx>(
    () => ({
      floor,
      register: (m) => {
        mats.current.add(m);
        return () => mats.current.delete(m);
      },
    }),
    [floor],
  );

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const { yOff, opacity, visible } = floorTargets(floor, total);
    const k = 1 - Math.exp(-dt * 5);
    g.position.y += (baseY + yOff - g.position.y) * k;
    let any = false;
    for (const m of mats.current) {
      const role = m.userData.role as string;
      const base = (m.userData.baseOpacity as number) ?? 1;
      const target = (opacity[role] ?? opacity.default) * base;
      const next = m.opacity + (target - m.opacity) * k;
      if (Math.abs(next - m.opacity) > 0.0005) {
        m.opacity = next;
        m.transparent = next < 0.995 || base < 1;
      }
      if (m.opacity > 0.01) any = true;
    }
    g.visible = visible || any;
  });

  return (
    <Ctx.Provider value={ctx}>
      <group ref={group} position-y={baseY}>
        {children}
      </group>
    </Ctx.Provider>
  );
}

export function useRegisterMaterial(m: THREE.Material | THREE.Material[] | null | undefined) {
  const ctx = useFloorCtx();
  useMemo(() => {
    if (!ctx || !m) return;
    const arr = Array.isArray(m) ? m : [m];
    arr.forEach((x) => ctx.register(x));
  }, [ctx, m]);
}
