"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getModel } from "@/lib/architecture/model";
import { useTwin } from "@/store/twin";
import { useProfile } from "@/store/quality";
import { useSim } from "@/store/sim";
import { mulberry32 } from "@/lib/utils";
import { EXPLODE_GAP } from "./FloorGroup";

const N = 720;

interface Particle {
  floor: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
  speed: number;
  roomId: string | null;
}

export function GuestFlow() {
  const ref = useRef<THREE.Points>(null!);
  const profile = useProfile();
  const model = getModel();
  const { particles, positions } = useMemo(() => {
    const r = mulberry32(model.rooms.length * 31 + 7);
    const guestFloors = model.floors.filter((f) => f.kind === "guest");
    const ps: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const kind = r();
      if (kind < 0.7) {
        const f = guestFloors[Math.floor(r() * guestFloors.length)];
        const room = f.rooms[Math.floor(r() * f.rooms.length)];
        const core = new THREE.Vector3(0, f.y + 1.2, 0);
        const door = new THREE.Vector3(room.doorPos[0], f.y + 1.2, room.facing * model.dims.corridorW * 0.45);
        ps.push({ floor: f.index, a: r() < 0.5 ? core : door, b: r() < 0.5 ? door : core, t: r(), speed: 0.08 + r() * 0.1, roomId: room.id });
      } else if (kind < 0.9) {
        const x = (r() - 0.5) * model.dims.length * 0.9;
        const a = new THREE.Vector3(x, 1.2, -model.dims.depth * 0.3);
        const b = new THREE.Vector3((r() - 0.5) * model.dims.length * 0.9, 1.2, -model.dims.depth * 0.1 - r() * 4);
        ps.push({ floor: 0, a, b, t: r(), speed: 0.05 + r() * 0.05, roomId: null });
      } else {
        const a = new THREE.Vector3((r() - 0.5) * 30, 1.0, -model.dims.depth / 2 - 6 - r() * 20);
        const b = new THREE.Vector3((r() - 0.5) * 30, 1.0, -model.dims.depth / 2 - 30 - r() * 30);
        ps.push({ floor: 0, a, b, t: r(), speed: 0.03 + r() * 0.04, roomId: null });
      }
    }
    return { particles: ps, positions: new Float32Array(N * 3) };
  }, [model]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const { showGuests, viewMode, isolatedFloor } = useTwin.getState();
    pts.visible = showGuests && profile.particles;
    if (!pts.visible) return;
    const rooms = useSim.getState().state.rooms;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const occupied = p.roomId ? !!rooms[p.roomId]?.guestId : true;
      const hidden = !occupied || ((viewMode === "isolate" || viewMode === "room") && isolatedFloor !== null && p.floor > isolatedFloor);
      p.t += dt * p.speed;
      if (p.t > 1) {
        p.t = 0;
        const tmp = p.a;
        p.a = p.b;
        p.b = tmp;
      }
      const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
      const yOff = viewMode === "exploded" ? p.floor * EXPLODE_GAP : 0;
      arr[i * 3] = hidden ? 0 : p.a.x + (p.b.x - p.a.x) * e;
      arr[i * 3 + 1] = hidden ? -50 : p.a.y + (p.b.y - p.a.y) * e + yOff;
      arr[i * 3 + 2] = hidden ? 0 : p.a.z + (p.b.z - p.a.z) * e;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#5eead4" size={0.5} sizeAttenuation transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  );
}
