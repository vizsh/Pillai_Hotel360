"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { FloorSpec, ResortModel, ZoneCell } from "@/lib/architecture/types";
import type { ResortConfig } from "@/lib/architecture/config";
import { box, buildFacadeGlass, buildFloorSlab, buildMullions, merge } from "@/lib/twin/geometry";
import { makeCore, makeFurniture, makeGlass, makeMullion, makeSlab, makeWall } from "@/lib/twin/materials";
import { FloorGroup, useRegisterMaterial } from "../FloorGroup";
import { useProfile } from "@/store/quality";
import { useTwin } from "@/store/twin";
import { AssetMeshes } from "../Assets";

const zoneTint: Record<string, string> = {
  lobby: "#1a2a3c",
  reception: "#1e3548",
  restaurant: "#2a2238",
  bar: "#2a2238",
  kitchen: "#2b2b2b",
  spa: "#1f3335",
  gym: "#22303a",
  conference: "#2b2f3a",
  "housekeeping-store": "#3a2f1e",
  "fb-store": "#3a2f1e",
  boh: "#2b2b2b",
  "pool-deck": "#0f3a4a",
  "sky-bar": "#2a2238",
};

function Zones({ zones, y = 0 }: { zones: ZoneCell[]; y?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 0.05, 1), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, transparent: true, opacity: 0.95 });
    m.userData.role = "plate";
    m.userData.baseOpacity = 0.95;
    return m;
  }, []);
  useRegisterMaterial(mat);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    zones.forEach((z, i) => {
      m.makeScale(z.w - 0.4, 1, z.d - 0.4);
      m.setPosition(z.center[0], y + 0.03, z.center[2]);
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, c.set(zoneTint[z.kind] ?? "#222"));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [zones, y]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    useTwin.getState().select({ kind: "zone", id: zones[e.instanceId].id });
  };
  return <instancedMesh ref={ref} args={[geo, mat, zones.length]} onClick={onClick} receiveShadow frustumCulled={false} />;
}

export function GroundFloor({ floor, cfg, model }: { floor: FloorSpec; cfg: ResortConfig; model: ResortModel }) {
  const profile = useProfile();
  const h = floor.height - cfg.tower.slabThickness;
  const zones = useMemo(() => model.zones.filter((z) => z.floor === 0), [model]);

  const geos = useMemo(() => {
    const L = model.dims.length / 2;
    const D = model.dims.depth / 2;
    const cols: THREE.BufferGeometry[] = [];
    for (let x = -L + 4; x < L; x += 8) {
      cols.push(box(0.5, h, 0.5, x, h / 2, -D + 0.8));
      cols.push(box(0.5, h, 0.5, x, h / 2, D - 0.8));
      if (Math.abs(x) > 6) cols.push(box(0.5, h, 0.5, x, h / 2, 0));
    }
    const walls: THREE.BufferGeometry[] = [];
    walls.push(box(0.14, h, D - 1.5, -14, h / 2, D - (D - 1.5) / 2));
    walls.push(box(0.14, h, D - 1.5, 14, h / 2, D - (D - 1.5) / 2));
    walls.push(box(0.14, h, D, -14, h / 2, -D / 2));
    walls.push(box(0.14, h, D, 14, h / 2, -D / 2));
    walls.push(box(0.14, h, D, 24, h / 2, -D / 2));
    walls.push(box(L - 14, h, 0.14, 14 + (L - 14) / 2, h / 2, 0));
    walls.push(box(L - 14, h, 0.14, -14 - (L - 14) / 2, h / 2, 0));
    walls.push(box(0.14, h, D - 1.5, 4.5, h / 2, D - (D - 1.5) / 2));
    walls.push(box(0.14, h, D - 1.5, 9.5, h / 2, D - (D - 1.5) / 2));
    walls.push(box(0.14, h, D - 1.5, -4.5, h / 2, D - (D - 1.5) / 2));
    const furn: THREE.BufferGeometry[] = [];
    furn.push(box(6, 1.1, 0.9, -9, 0.55, 5));
    for (let i = 0; i < 12; i++) {
      const tx = -28 + (i % 4) * 4;
      const tz = -D + 2.5 + Math.floor(i / 4) * 3;
      furn.push(box(1.2, 0.06, 1.2, tx, 0.75, tz));
      furn.push(box(0.12, 0.72, 0.12, tx, 0.36, tz));
    }
    for (let i = 0; i < 6; i++) furn.push(box(2.2, 0.55, 0.9, -8 + (i % 3) * 5, 0.28, -D + 4 + Math.floor(i / 3) * 5));
    for (let i = 0; i < 4; i++) furn.push(box(1.8, 0.6, 0.8, 16 + i * 2.2, 0.3, -D + 3));
    for (let i = 0; i < 6; i++) furn.push(box(0.6, 1.4, 1.6, 25 + (i % 3) * 1.6, 0.7, -D + 3 + Math.floor(i / 3) * 3));
    return {
      slab: buildFloorSlab(cfg, model),
      cols: merge(cols),
      walls: merge(walls),
      furn: merge(furn),
      glass: buildFacadeGlass(cfg, floor, model),
      mullions: buildMullions(cfg, floor, model),
      core: box(cfg.plate.coreW, h, model.dims.depth - 0.4, 0, h / 2, 0),
    };
  }, [cfg, floor, model, h]);

  const mats = useMemo(
    () => ({
      slab: makeSlab(),
      wall: makeWall(),
      col: makeCore(),
      furn: makeFurniture("#7a5a44"),
      glass: makeGlass(profile.transmission),
      mullion: makeMullion(),
      core: makeCore(),
    }),
    [profile.transmission],
  );
  useRegisterMaterial(Object.values(mats));

  return (
    <FloorGroup floor={0} baseY={0}>
      <mesh geometry={geos.slab} material={mats.slab} receiveShadow />
      <mesh geometry={geos.cols} material={mats.col} castShadow />
      <mesh geometry={geos.walls} material={mats.wall} castShadow receiveShadow />
      <mesh geometry={geos.core} material={mats.core} castShadow />
      <mesh geometry={geos.furn} material={mats.furn} castShadow />
      <mesh geometry={geos.mullions} material={mats.mullion} />
      <mesh geometry={geos.glass} material={mats.glass} />
      <Zones zones={zones} />
      <AssetMeshes floor={0} />
    </FloorGroup>
  );
}

export { Zones };
