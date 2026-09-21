"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ResortModel } from "@/lib/architecture/types";
import type { ResortConfig } from "@/lib/architecture/config";
import { box, buildFloorSlab, merge } from "@/lib/twin/geometry";
import { makeCore, makeMullion, makeSlab, makeWall } from "@/lib/twin/materials";
import { FloorGroup, useRegisterMaterial } from "../FloorGroup";
import { Zones } from "./GroundFloor";
import { AssetMeshes } from "../Assets";

export function WaterMaterial({ color = "#0aa5c7", opacity = 0.86 }: { color?: string; opacity?: number }) {
  const ref = useRef<THREE.MeshPhysicalMaterial>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ref.current) ref.current.emissiveIntensity = 0.18 + 0.08 * Math.sin(t * 1.3);
  });
  return (
    <meshPhysicalMaterial
      ref={ref}
      color={color}
      emissive="#0f8fa8"
      emissiveIntensity={0.2}
      roughness={0.08}
      metalness={0.05}
      clearcoat={1}
      clearcoatRoughness={0.05}
      transparent
      opacity={opacity}
      envMapIntensity={2}
    />
  );
}

export function Roof({ cfg, model }: { cfg: ResortConfig; model: ResortModel }) {
  const zones = useMemo(() => model.zones.filter((z) => z.floor === cfg.tower.floors), [model, cfg]);
  const L = model.dims.length / 2;
  const D = model.dims.depth / 2;
  const geos = useMemo(() => {
    const par: THREE.BufferGeometry[] = [
      box(model.dims.length + 0.6, 1.1, 0.2, 0, 0.55, D + 0.2),
      box(model.dims.length + 0.6, 1.1, 0.2, 0, 0.55, -D - 0.2),
      box(0.2, 1.1, model.dims.depth + 0.6, L + 0.2, 0.55, 0),
      box(0.2, 1.1, model.dims.depth + 0.6, -L - 0.2, 0.55, 0),
    ];
    const plant: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) plant.push(box(0.08, 2.6, model.dims.depth - 2, -L + 1.5 + i * 1.4, 1.3, 0.5));
    plant.push(box(13, 0.15, model.dims.depth - 2, -L + 7, 2.7, 0.5));
    const bar: THREE.BufferGeometry[] = [];
    for (let x = 18; x < L; x += 5) {
      bar.push(box(0.3, 3.2, 0.3, x, 1.6, -D + 1.5));
      bar.push(box(0.3, 3.2, 0.3, x, 1.6, D - 1.5));
    }
    bar.push(box(L - 17, 0.2, model.dims.depth - 2, 17 + (L - 17) / 2, 3.3, 0));
    bar.push(box(5, 1.1, 1, 24, 0.55, 0));
    for (let i = 0; i < 8; i++) bar.push(box(1, 0.06, 1, 19 + (i % 4) * 3, 0.7, -5 + Math.floor(i / 4) * 10));
    const core = box(cfg.plate.coreW, 3.2, 6, 0, 1.6, D - 4);
    return { slab: buildFloorSlab(cfg, model, true), parapet: merge(par), plant: merge(plant), bar: merge(bar), core };
  }, [cfg, model, L, D]);
  const mats = useMemo(() => ({ slab: makeSlab(), wall: makeWall(), louvre: makeMullion(), core: makeCore() }), []);
  useRegisterMaterial(Object.values(mats));
  const poolW = 28;
  const poolD = 9;
  return (
    <FloorGroup floor={cfg.tower.floors} baseY={model.roofY}>
      <mesh geometry={geos.slab} material={mats.slab} receiveShadow castShadow />
      <mesh geometry={geos.parapet} material={mats.wall} castShadow />
      <mesh geometry={geos.plant} material={mats.louvre} castShadow />
      <mesh geometry={geos.bar} material={mats.core} castShadow />
      <mesh geometry={geos.core} material={mats.core} castShadow />
      <mesh position={[0, 0.02, -D + poolD / 2 + 1.8]} receiveShadow>
        <boxGeometry args={[poolW + 1, 0.5, poolD + 1]} />
        <meshStandardMaterial color="#c7b8a2" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, -D + poolD / 2 + 1.8]}>
        <boxGeometry args={[poolW, 0.2, poolD]} />
        <WaterMaterial />
      </mesh>
      <Zones zones={zones} y={0.3} />
      <AssetMeshes floor={cfg.tower.floors} />
    </FloorGroup>
  );
}
