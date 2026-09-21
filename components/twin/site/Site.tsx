"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ResortModel } from "@/lib/architecture/types";
import type { ResortConfig } from "@/lib/architecture/config";
import { mulberry32, randRange } from "@/lib/utils";
import { box, merge } from "@/lib/twin/geometry";
import { WaterMaterial } from "../tower/Roof";
import { useProfile } from "@/store/quality";

function Palms({ cfg, model }: { cfg: ResortConfig; model: ResortModel }) {
  const profile = useProfile();
  const count = Math.floor(cfg.site.palms * profile.palms);
  const trunk = useRef<THREE.InstancedMesh>(null!);
  const frond = useRef<THREE.InstancedMesh>(null!);
  const geos = useMemo(
    () => ({ trunk: new THREE.CylinderGeometry(0.16, 0.3, 1, 7), frond: new THREE.ConeGeometry(0.5, 1, 5) }),
    [],
  );
  const positions = useMemo(() => {
    const r = mulberry32(cfg.seed + 77);
    const L = model.dims.length / 2;
    const D = model.dims.depth / 2;
    const out: [number, number, number, number][] = [];
    let tries = 0;
    while (out.length < cfg.site.palms && tries++ < 4000) {
      const x = randRange(r, -110, 110);
      const z = randRange(r, -70, 60);
      if (Math.abs(x) < L + 6 && Math.abs(z) < D + 6) continue;
      if (Math.abs(x) < 26 && z < -D - 4 && z > -D - 52) continue;
      if (x > L + 8 && x < L + 60 && z > 10 && z < 50) continue;
      if (z < -80) continue;
      out.push([x, z, randRange(r, 5, 9), r() * Math.PI * 2]);
    }
    return out;
  }, [cfg, model]);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let fi = 0;
    positions.slice(0, count).forEach(([x, z, h, rot], i) => {
      q.setFromAxisAngle(up, rot);
      s.set(1, h, 1);
      p.set(x, h / 2, z);
      trunk.current.setMatrixAt(i, m.compose(p, q, s));
      for (let k = 0; k < 7; k++) {
        const a = rot + (k / 7) * Math.PI * 2;
        const e = new THREE.Euler(Math.PI * 0.62, a, 0, "YXZ");
        q.setFromEuler(e);
        s.set(1, 3.2, 0.5);
        p.set(x + Math.sin(a) * 1.3, h + 0.6, z + Math.cos(a) * 1.3);
        frond.current.setMatrixAt(fi++, m.compose(p, q, s));
      }
    });
    trunk.current.instanceMatrix.needsUpdate = true;
    frond.current.instanceMatrix.needsUpdate = true;
  }, [positions, count]);

  return (
    <>
      <instancedMesh ref={trunk} args={[geos.trunk, undefined, count]} castShadow>
        <meshStandardMaterial color="#5a4633" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={frond} args={[geos.frond, undefined, count * 7]} castShadow>
        <meshStandardMaterial color="#1f6b3a" roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
    </>
  );
}

function Ocean() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = -0.35 + Math.sin(clock.elapsedTime * 0.6) * 0.05;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.35, -220]}>
      <planeGeometry args={[900, 300]} />
      <meshPhysicalMaterial color="#04365a" emissive="#062f4a" emissiveIntensity={0.35} roughness={0.12} metalness={0.1} clearcoat={1} envMapIntensity={2.2} />
    </mesh>
  );
}

export function Site({ cfg, model }: { cfg: ResortConfig; model: ResortModel }) {
  const L = model.dims.length / 2;
  const D = model.dims.depth / 2;
  const geos = useMemo(() => {
    const r = mulberry32(cfg.seed + 5);
    const cab: THREE.BufferGeometry[] = [];
    for (let i = 0; i < cfg.site.cabanas; i++) {
      const x = -24 + i * 7;
      const z = -D - 56;
      cab.push(box(0.12, 2.4, 0.12, x - 1.5, 1.2, z - 1.5), box(0.12, 2.4, 0.12, x + 1.5, 1.2, z - 1.5), box(0.12, 2.4, 0.12, x - 1.5, 1.2, z + 1.5), box(0.12, 2.4, 0.12, x + 1.5, 1.2, z + 1.5));
      cab.push(box(3.6, 0.12, 3.6, x, 2.45, z));
      cab.push(box(2.4, 0.4, 1.2, x, 0.3, z));
    }
    const cars: THREE.BufferGeometry[] = [];
    const px = L + 34;
    const pz = 30;
    for (let i = 0; i < cfg.site.cars; i++) {
      if (r() < 0.25) continue;
      const cx = px - 22 + (i % 12) * 3.2;
      const cz = pz - 8 + Math.floor(i / 12) * 8;
      cars.push(box(1.9, 0.8, 4.2, cx, 0.5, cz), box(1.6, 0.6, 2.2, cx, 1.15, cz - 0.2));
    }
    const drive: THREE.BufferGeometry[] = [box(9, 0.06, 60, L + 20, 0.02, 30), box(60, 0.06, 9, L + 20, 0.02, D + 12), box(40, 0.06, 26, px - 6, 0.02, pz)];
    const deck = box(46, 0.16, 62, 0, 0.05, -D - 36);
    const beach = box(320, 0.1, 40, 0, -0.05, -D - 95);
    const lounge: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) lounge.push(box(0.7, 0.35, 1.9, -20 + (i % 8) * 5.5, 0.28, -D - 18 - Math.floor(i / 8) * 40));
    return { cab: merge(cab), cars: merge(cars), drive: merge(drive), deck, beach, lounge: merge(lounge) };
  }, [cfg, L, D]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, -20]} receiveShadow>
        <planeGeometry args={[cfg.site.groundSize * 2, cfg.site.groundSize]} />
        <meshStandardMaterial color="#1b3a2a" roughness={1} />
      </mesh>
      <mesh geometry={geos.beach} receiveShadow>
        <meshStandardMaterial color="#c9b691" roughness={1} />
      </mesh>
      <Ocean />
      <mesh geometry={geos.deck} receiveShadow>
        <meshStandardMaterial color="#bfb09a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.08, -D - 34]}>
        <boxGeometry args={[cfg.site.poolSize[0], 0.3, cfg.site.poolSize[1]]} />
        <WaterMaterial color="#0fb7d6" />
      </mesh>
      <mesh geometry={geos.lounge} castShadow>
        <meshStandardMaterial color="#e8e0d0" roughness={0.9} />
      </mesh>
      <mesh geometry={geos.cab} castShadow>
        <meshStandardMaterial color="#efe6d6" roughness={0.9} />
      </mesh>
      <mesh geometry={geos.drive} receiveShadow>
        <meshStandardMaterial color="#22262c" roughness={1} />
      </mesh>
      <mesh geometry={geos.cars} castShadow>
        <meshStandardMaterial color="#8a93a3" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[L + 20, 2, D + 12]} castShadow>
        <boxGeometry args={[14, 4, 6]} />
        <meshStandardMaterial color="#2a3441" roughness={0.6} />
      </mesh>
      <Palms cfg={cfg} model={model} />
    </group>
  );
}
