"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FloorSpec } from "@/lib/architecture/types";
import { layoutFurniture } from "@/lib/twin/geometry";
import { useFurnitureModel, toFloorPivot, type FurnitureModelKey } from "@/lib/twin/furnitureModels";
import { useRegisterMaterial } from "../FloorGroup";

function Instanced({ geo, mat, matrices }: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useRegisterMaterial(mat);
  useEffect(() => {
    if (!ref.current) return;
    matrices.forEach((m, i) => ref.current.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, matrices.length]} castShadow receiveShadow frustumCulled={false} />;
}

/** One real (CC0 Kenney) furniture model, instanced across every room on this floor that
 * needs one. Each model merges several material-groups (frame, cushions, doors…) into one
 * geometry, so the material is an array matched to those groups — cloned per floor so
 * useRegisterMaterial can still fade the whole model independently in x-ray/floor-isolate
 * mode, same as every other floor material. */
function ModelInstanced({ modelKey, matrices }: { modelKey: FurnitureModelKey; matrices: THREE.Matrix4[] }) {
  const model = useFurnitureModel(modelKey);
  const mats = useMemo(() => model?.materials.map((m) => m.clone()) ?? null, [model]);
  const floorMatrices = useMemo(() => toFloorPivot(matrices), [matrices]);
  if (!model || !mats) return null;
  return <Instanced geo={model.geometry} mat={mats} matrices={floorMatrices} />;
}

export function Furniture({ floor }: { floor: FloorSpec }) {
  const set = useMemo(() => layoutFurniture(floor), [floor]);
  return (
    <group>
      <ModelInstanced modelKey="bed" matrices={set.bed} />
      <ModelInstanced modelKey="nightstand" matrices={set.nightstand} />
      <ModelInstanced modelKey="desk" matrices={set.desk} />
      <ModelInstanced modelKey="wardrobe" matrices={set.wardrobe} />
      <ModelInstanced modelKey="sofa" matrices={set.sofa} />
    </group>
  );
}
