"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { deptColors } from "@/lib/twin/colors";
import { getModel } from "@/lib/architecture/model";
import { EXPLODE_GAP } from "./FloorGroup";

const MAX = 64;
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);

export function StaffAgents() {
  const body = useRef<THREE.InstancedMesh>(null!);
  const halo = useRef<THREE.InstancedMesh>(null!);
  const smooth = useRef(new Map<string, THREE.Vector3>());
  const ids = useRef<string[]>([]);
  const geo = useMemo(() => new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), []);
  const haloGeo = useMemo(() => new THREE.RingGeometry(0.45, 0.62, 24), []);
  const model = getModel();

  useFrame((_, dt) => {
    const { showStaff, viewMode, isolatedFloor, selected } = useTwin.getState();
    const b = body.current;
    const h = halo.current;
    if (!b || !h) return;
    if (!b.boundingSphere) {
      b.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 400);
      h.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 400);
    }
    if (!showStaff) {
      b.count = 0;
      h.count = 0;
      return;
    }
    const state = useSim.getState().state;
    const list = Object.values(state.staff).filter((s) => s.status !== "off");
    const k = 1 - Math.exp(-dt * 6);
    let i = 0;
    ids.current.length = 0;
    for (const s of list) {
      if (i >= MAX) break;
      if ((viewMode === "isolate" || viewMode === "room") && isolatedFloor !== null && s.floor > isolatedFloor) continue;
      let v = smooth.current.get(s.id);
      if (!v) {
        v = new THREE.Vector3(s.position[0], s.position[1], s.position[2]);
        smooth.current.set(s.id, v);
      }
      tmpP.set(s.position[0], s.position[1], s.position[2]);
      if (v.distanceToSquared(tmpP) > 400) v.copy(tmpP);
      else v.lerp(tmpP, k);
      const yOff = viewMode === "exploded" ? s.floor * EXPLODE_GAP : 0;
      const bob = s.status === "working" ? Math.sin(performance.now() * 0.008 + i) * 0.06 : 0;
      tmpS.set(1, 1, 1);
      b.setMatrixAt(i, tmpM.compose(tmpP.set(v.x, v.y + yOff + 0.75 + bob, v.z), tmpQ.identity(), tmpS));
      tmpC.set(deptColors[s.dept] ?? "#ffffff");
      if (selected?.kind === "staff" && selected.id === s.id) tmpC.lerp(new THREE.Color("#ffffff"), 0.5);
      b.setColorAt(i, tmpC);
      const pulse = s.status === "moving" ? 1 + 0.15 * Math.sin(performance.now() * 0.01) : 1;
      tmpS.set(pulse, pulse, pulse);
      tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      h.setMatrixAt(i, tmpM.compose(tmpP.set(v.x, v.y + yOff + 0.04, v.z), tmpQ, tmpS));
      h.setColorAt(i, tmpC);
      ids.current[i] = s.id;
      i++;
    }
    b.count = i;
    h.count = i;
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId !== undefined ? ids.current[e.instanceId] : null;
    if (id) useTwin.getState().select({ kind: "staff", id });
  };

  void model;
  return (
    <group>
      <instancedMesh ref={body} args={[geo, undefined, MAX]} onClick={onClick} frustumCulled={false} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.1} emissive="#ffffff" emissiveIntensity={0.25} />
      </instancedMesh>
      <instancedMesh ref={halo} args={[haloGeo, undefined, MAX]} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
