"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getModel } from "@/lib/architecture/model";
import { floorY } from "@/lib/architecture/generate";
import { defaultConfig } from "@/lib/architecture/config";
import { useTwin } from "@/store/twin";
import { useSim } from "@/store/sim";
import { useRegisterMaterial } from "./FloorGroup";

const healthy = new THREE.Color("#2dd4bf");
const warn = new THREE.Color("#f5a524");
const crit = new THREE.Color("#f4436c");
const tmp = new THREE.Color();

function AssetMesh({ id }: { id: string }) {
  const model = getModel();
  const a = model.assetById.get(id)!;
  const y0 = floorY(defaultConfig, a.floor);
  const body = useRef<THREE.MeshStandardMaterial>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3b4656", roughness: 0.5, metalness: 0.6, emissive: "#000000" }), []);
  useRegisterMaterial(mat);
  useFrame(({ clock }) => {
    const st = useSim.getState().state.assets[id];
    const sel = useTwin.getState().selected;
    const risk = st?.failureProb7d ?? 0;
    const t = clock.elapsedTime;
    if (risk > 0.35) tmp.copy(warn).lerp(crit, Math.min(1, (risk - 0.35) / 0.4));
    else tmp.copy(healthy).multiplyScalar(0.4);
    const pulse = risk > 0.35 ? 0.35 + 0.35 * Math.sin(t * (2 + risk * 6)) : 0.08;
    mat.emissive.copy(tmp);
    mat.emissiveIntensity = pulse + (sel?.kind === "asset" && sel.id === id ? 0.8 : 0);
    if (ring.current) {
      ring.current.visible = risk > 0.35;
      const s = 1 + ((t * 0.8) % 1) * 1.6;
      ring.current.scale.setScalar(s);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - ((t * 0.8) % 1)) * 0.6;
      (ring.current.material as THREE.MeshBasicMaterial).color.copy(tmp);
    }
  });
  return (
    <group position={[a.position[0], a.position[1] - y0, a.position[2]]}>
      <mesh
        material={mat}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          useTwin.getState().select({ kind: "asset", id });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          useTwin.getState().hover({ kind: "asset", id });
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
          useTwin.getState().hover(null);
        }}
      >
        <boxGeometry args={a.size} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={-a.size[1] / 2 + 0.05}>
        <ringGeometry args={[Math.max(a.size[0], a.size[2]) * 0.6, Math.max(a.size[0], a.size[2]) * 0.68, 40]} />
        <meshBasicMaterial transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function AssetMeshes({ floor }: { floor: number }) {
  const ids = useMemo(() => getModel().assets.filter((a) => a.floor === floor && a.kind !== "elevator").map((a) => a.id), [floor]);
  return (
    <>
      {ids.map((id) => (
        <AssetMesh key={id} id={id} />
      ))}
    </>
  );
}
