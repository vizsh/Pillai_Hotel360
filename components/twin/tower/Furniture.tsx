"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FloorSpec } from "@/lib/architecture/types";
import { layoutFurniture } from "@/lib/twin/geometry";
import { makeFurniture } from "@/lib/twin/materials";
import { useRegisterMaterial } from "../FloorGroup";

function Instanced({ geo, mat, matrices }: { geo: THREE.BufferGeometry; mat: THREE.Material; matrices: THREE.Matrix4[] }) {
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

export function Furniture({ floor }: { floor: FloorSpec }) {
  const set = useMemo(() => layoutFurniture(floor), [floor]);
  const geos = useMemo(
    () => ({
      bed: new THREE.BoxGeometry(1, 0.5, 1),
      headboard: new THREE.BoxGeometry(1, 1.2, 0.12),
      nightstand: new THREE.BoxGeometry(0.5, 0.5, 0.45),
      desk: new THREE.BoxGeometry(0.6, 0.06, 1.6),
      wardrobe: new THREE.BoxGeometry(0.6, 2.1, 1.4),
      sofa: new THREE.BoxGeometry(1.8, 0.65, 0.9),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      bed: makeFurniture("#e6e1d6"),
      headboard: makeFurniture("#6b4e3d"),
      nightstand: makeFurniture("#6b4e3d"),
      desk: makeFurniture("#7a5a44"),
      wardrobe: makeFurniture("#5a4335"),
      sofa: makeFurniture("#3f5566"),
    }),
    [],
  );
  return (
    <group>
      <Instanced geo={geos.bed} mat={mats.bed} matrices={set.bed} />
      <Instanced geo={geos.headboard} mat={mats.headboard} matrices={set.headboard} />
      <Instanced geo={geos.nightstand} mat={mats.nightstand} matrices={set.nightstand} />
      <Instanced geo={geos.desk} mat={mats.desk} matrices={set.desk} />
      <Instanced geo={geos.wardrobe} mat={mats.wardrobe} matrices={set.wardrobe} />
      <Instanced geo={geos.sofa} mat={mats.sofa} matrices={set.sofa} />
    </group>
  );
}
