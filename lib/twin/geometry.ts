import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FloorSpec, ResortModel, RoomCell } from "@/lib/architecture/types";
import type { ResortConfig } from "@/lib/architecture/config";

export function box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function plane(w: number, h: number, x: number, y: number, z: number, ry: number) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function merge(parts: THREE.BufferGeometry[]) {
  if (!parts.length) return new THREE.BufferGeometry();
  const m = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return m;
}

const WALL = 0.14;
const DOOR_W = 1.0;

export function buildGuestFloorWalls(cfg: ResortConfig, floor: FloorSpec, model: ResortModel) {
  const parts: THREE.BufferGeometry[] = [];
  const h = floor.height - cfg.tower.slabThickness;
  const yC = h / 2;
  const { corridorW, roomD, coreW } = cfg.plate;
  const L = model.dims.length / 2;
  const bySide = { north: [] as RoomCell[], south: [] as RoomCell[] };
  for (const r of floor.rooms) bySide[r.side].push(r);

  for (const side of ["north", "south"] as const) {
    const rooms = bySide[side].sort((a, b) => a.center[0] - b.center[0]);
    const facing = side === "north" ? 1 : -1;
    const zCorr = facing * (corridorW / 2);
    const zMid = facing * (corridorW / 2 + roomD / 2);
    const xs = new Set<number>();
    for (const r of rooms) {
      xs.add(+(r.center[0] - r.w / 2).toFixed(3));
      xs.add(+(r.center[0] + r.w / 2).toFixed(3));
    }
    for (const x of xs) {
      if (Math.abs(Math.abs(x) - L) < 0.01) continue;
      parts.push(box(WALL, h, roomD, x, yC, zMid));
    }
    for (const r of rooms) {
      const x0 = r.center[0] - r.w / 2;
      const x1 = r.center[0] + r.w / 2;
      const dx = r.doorPos[0];
      const leftW = dx - DOOR_W / 2 - x0;
      const rightW = x1 - (dx + DOOR_W / 2);
      if (leftW > 0.05) parts.push(box(leftW, h, WALL, x0 + leftW / 2, yC, zCorr));
      if (rightW > 0.05) parts.push(box(rightW, h, WALL, x1 - rightW / 2, yC, zCorr));
      parts.push(box(DOOR_W, h - 2.1, WALL, dx, 2.1 + (h - 2.1) / 2, zCorr));
      const bathD = 2.0;
      const bathW = Math.min(2.4, r.w * 0.42);
      const bathX = r.center[0] - r.w / 2 + bathW / 2;
      const bathZ = zCorr + facing * bathD / 2;
      parts.push(box(WALL, h, bathD, bathX + bathW / 2, yC, bathZ));
      parts.push(box(bathW, h, WALL, bathX, yC, zCorr + facing * bathD));
    }
  }
  parts.push(box(coreW, h, model.dims.depth - 0.4, 0, yC, 0));
  return merge(parts);
}

export function buildFloorSlab(cfg: ResortConfig, model: ResortModel, isRoof = false) {
  const t = cfg.tower.slabThickness;
  const g = new THREE.BoxGeometry(model.dims.length + 0.6, t, model.dims.depth + 0.6);
  g.translate(0, isRoof ? t / 2 : -t / 2, 0);
  return g;
}

export function buildFacadeGlass(cfg: ResortConfig, floor: FloorSpec, model: ResortModel) {
  const parts: THREE.BufferGeometry[] = [];
  const h = floor.height - cfg.tower.slabThickness;
  const D = model.dims.depth / 2 + 0.3;
  const L = model.dims.length / 2 + 0.3;
  parts.push(plane(model.dims.length + 0.6, h, 0, h / 2, D, 0));
  parts.push(plane(model.dims.length + 0.6, h, 0, h / 2, -D, Math.PI));
  parts.push(plane(model.dims.depth + 0.6, h, L, h / 2, 0, Math.PI / 2));
  parts.push(plane(model.dims.depth + 0.6, h, -L, h / 2, 0, -Math.PI / 2));
  return merge(parts);
}

export function buildMullions(cfg: ResortConfig, floor: FloorSpec, model: ResortModel) {
  const parts: THREE.BufferGeometry[] = [];
  const h = floor.height - cfg.tower.slabThickness;
  const D = model.dims.depth / 2 + 0.32;
  const L = model.dims.length / 2 + 0.32;
  const step = floor.kind === "ground" ? 4 : cfg.plate.roomW / 2;
  for (let x = -L; x <= L + 0.01; x += step) {
    parts.push(box(0.08, h, 0.12, x, h / 2, D));
    parts.push(box(0.08, h, 0.12, x, h / 2, -D));
  }
  for (let z = -D; z <= D + 0.01; z += step) {
    parts.push(box(0.12, h, 0.08, L, h / 2, z));
    parts.push(box(0.12, h, 0.08, -L, h / 2, z));
  }
  parts.push(box(model.dims.length + 0.7, 0.4, 0.14, 0, 0.2, D));
  parts.push(box(model.dims.length + 0.7, 0.4, 0.14, 0, 0.2, -D));
  return merge(parts);
}

export function buildBalconies(cfg: ResortConfig, floor: FloorSpec, model: ResortModel) {
  const parts: THREE.BufferGeometry[] = [];
  const D = model.dims.depth / 2 + 0.3;
  for (const r of floor.rooms) {
    if (r.side !== "south") continue;
    const depth = 1.5;
    const z = -D - depth / 2;
    parts.push(box(r.w - 0.3, 0.16, depth, r.center[0], -0.08, z));
    parts.push(box(r.w - 0.3, 1.05, 0.05, r.center[0], 0.52, -D - depth + 0.03));
    parts.push(box(0.05, 1.05, depth, r.center[0] - r.w / 2 + 0.16, 0.52, z));
    parts.push(box(0.05, 1.05, depth, r.center[0] + r.w / 2 - 0.16, 0.52, z));
  }
  return merge(parts);
}

export interface FurnitureSet {
  bed: THREE.Matrix4[];
  headboard: THREE.Matrix4[];
  nightstand: THREE.Matrix4[];
  desk: THREE.Matrix4[];
  wardrobe: THREE.Matrix4[];
  sofa: THREE.Matrix4[];
}

export function layoutFurniture(floor: FloorSpec): FurnitureSet {
  const set: FurnitureSet = { bed: [], headboard: [], nightstand: [], desk: [], wardrobe: [], sofa: [] };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const place = (arr: THREE.Matrix4[], x: number, y: number, z: number, ry: number, sx = 1, sy = 1, sz = 1) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    s.set(sx, sy, sz);
    arr.push(m.clone().compose(new THREE.Vector3(x, y, z), q, s));
  };
  for (const r of floor.rooms) {
    const f = r.facing;
    const cx = r.center[0];
    const zIn = r.center[2] - f * (r.d / 2) + f * 2.0;
    const zOut = r.center[2] + f * (r.d / 2);
    const bathW = Math.min(2.4, r.w * 0.42);
    const bedX = cx + r.w * 0.12;
    const bedZ = zIn + f * 1.6;
    const isSuite = r.type === "suite";
    const bedW = isSuite ? 2.0 : 1.7;
    place(set.bed, bedX, 0.28, bedZ, 0, bedW, 1, 2.05);
    place(set.headboard, bedX, 0.6, bedZ - f * 1.1, 0, bedW + 0.2, 1, 1);
    place(set.nightstand, bedX - bedW / 2 - 0.35, 0.26, bedZ - f * 0.75, 0);
    place(set.nightstand, bedX + bedW / 2 + 0.35, 0.26, bedZ - f * 0.75, 0);
    place(set.desk, cx + r.w / 2 - 0.5, 0.38, zOut - f * 1.9, 0);
    place(set.wardrobe, cx - r.w / 2 + bathW + 0.35, 1.05, zIn - f * 0.4, 0);
    if (isSuite) {
      place(set.sofa, cx - r.w * 0.22, 0.32, zOut - f * 1.6, 0);
      place(set.bed, cx - r.w * 0.28, 0.28, bedZ, 0, 1.2, 1, 2.05);
    }
  }
  return set;
}
