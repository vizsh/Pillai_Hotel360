import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** CC0 (public domain) — Kenney Furniture Kit, kenney.nl. See
 * public/models/furniture/LICENSE-kenney-furniture-kit.txt. */
export const FURNITURE_MODEL_URL = {
  bed: "/models/furniture/bedDouble.glb",
  nightstand: "/models/furniture/sideTableDrawers.glb",
  desk: "/models/furniture/desk.glb",
  wardrobe: "/models/furniture/bookcaseClosedDoors.glb",
  sofa: "/models/furniture/loungeSofa.glb",
} as const;

export type FurnitureModelKey = keyof typeof FURNITURE_MODEL_URL;

/** Real-world footprint (meters, x/y/z) each model is scaled to fit — matched against
 * the schematic sizes the old placeholder boxes used, so swapping in real geometry
 * doesn't require touching the room layout math in lib/twin/geometry.ts at all. */
const TARGET_SIZE: Record<FurnitureModelKey, THREE.Vector3> = {
  bed: new THREE.Vector3(1.75, 0.55, 2.05),
  nightstand: new THREE.Vector3(0.5, 0.5, 0.45),
  desk: new THREE.Vector3(1.3, 0.75, 0.65),
  wardrobe: new THREE.Vector3(1.1, 2.0, 0.55),
  sofa: new THREE.Vector3(1.8, 0.75, 0.9),
};

if (typeof window !== "undefined") {
  Object.values(FURNITURE_MODEL_URL).forEach((u) => useGLTF.preload(u));
}

/** Each Kenney piece is exported as several mesh primitives (frame, cushions, doors…)
 * each with its own material — NOT one mesh. Picking "the first mesh" (an earlier version
 * of this file did) grabs one small fragment and blows it up to the model's full target
 * size, which is exactly the bug that produced a camera-swallowing blob in room view.
 * This collects every primitive, bakes its world transform in, and merges them into one
 * BufferGeometry with per-primitive material groups — the standard three.js pattern for
 * instancing a multi-material glTF as a single InstancedMesh. */
function mergeSceneMeshes(scene: THREE.Object3D): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null {
  scene.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    // Keep only the attributes every primitive in these kits shares — color/uv sets can
    // differ per-part, and mergeGeometries requires identical attribute sets across inputs.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    }
    geometries.push(geo);
    materials.push((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material);
  });
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries, true);
  if (!merged) return null;
  return { geometry: merged, materials };
}

/** Loads a Kenney furniture glTF and normalizes it to a floor-pivot convention (centered
 * on x/z, base sitting at y=0) scaled to TARGET_SIZE — so every model can be placed with
 * the same (x, y=0, z, rotationY) transform regardless of its native modeling scale or
 * origin. Geometry is cloned before the in-place translate/scale so drei's shared GLTF
 * cache (one load per URL) is never mutated. */
export function useFurnitureModel(key: FurnitureModelKey) {
  const gltf = useGLTF(FURNITURE_MODEL_URL[key]);
  return useMemo(() => {
    const merged = mergeSceneMeshes(gltf.scene);
    if (!merged) return null;
    const { geometry, materials } = merged;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return null;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -box.min.y, -center.z);
    const target = TARGET_SIZE[key];
    geometry.scale(target.x / Math.max(0.05, size.x), target.y / Math.max(0.05, size.y), target.z / Math.max(0.05, size.z));
    geometry.computeVertexNormals();
    return { geometry, materials };
  }, [gltf, key]);
}

/** Rebuilds a set of placement matrices at floor level (y=0), keeping only the x/z
 * position and y-rotation the schematic layout already computed — real furniture models
 * carry their own height and don't need the old unit-box vertical centering. */
export function toFloorPivot(matrices: THREE.Matrix4[]): THREE.Matrix4[] {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  return matrices.map((mat) => {
    mat.decompose(pos, quat, scl);
    return new THREE.Matrix4().compose(new THREE.Vector3(pos.x, 0, pos.z), quat, new THREE.Vector3(1, 1, 1));
  });
}
