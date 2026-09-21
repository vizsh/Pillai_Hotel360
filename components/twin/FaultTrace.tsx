"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useTrace, DRAW_DURATION, HOLD_DURATION } from "@/store/trace";
import { useTwin } from "@/store/twin";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { roomAnchor, assetAnchor, sampleServedRoom, worstAssetForRoom } from "@/lib/twin/trace";
import { clamp } from "@/lib/utils";

const SEGMENTS = 48;
const RED = new THREE.Color("#f4436c");
const CYAN = new THREE.Color("#5eead4");
const AUTO_COOLDOWN_MS = 9000;
const AUTO_POLL_S = 1;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function FaultTrace() {
  const active = useTrace((s) => s.active);
  const roomId = useTrace((s) => s.roomId);
  const assetId = useTrace((s) => s.assetId);
  const startedAt = useTrace((s) => s.startedAt);
  const auto = useTrace((s) => s.auto);

  const headRef = useRef<THREE.Mesh>(null!);
  const labelGroupRef = useRef<THREE.Group>(null!);
  const labelRef = useRef<HTMLDivElement>(null!);
  const curveData = useRef<THREE.Vector3[] | null>(null);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: "#f4436c", transparent: true, opacity: 0.95, toneMapped: false }), []);
  const lineObj = useMemo(() => {
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    return l;
  }, [geo, mat]);
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.3, 12, 12), []);
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f4436c", toneMapped: false, transparent: true }), []);

  useEffect(() => {
    if (!active || !roomId || !assetId) {
      curveData.current = null;
      return;
    }
    const model = getModel();
    const { viewMode } = useTwin.getState();
    const a = roomAnchor(model, roomId, viewMode);
    const b = assetAnchor(model, assetId, viewMode);
    if (!a || !b) {
      curveData.current = null;
      return;
    }
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += Math.max(5, start.distanceTo(end) * 0.35);
    curveData.current = new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(SEGMENTS);
  }, [active, roomId, assetId]);

  const seenAlerts = useRef<Set<string>>(new Set());
  const seenChat = useRef<Set<string>>(new Set());
  const lastAutoAt = useRef(0);
  const pollAcc = useRef(0);

  useFrame((_, dt) => {
    if (active && curveData.current) {
      const elapsed = (performance.now() - startedAt) / 1000;
      const drawT = clamp(elapsed / DRAW_DURATION, 0, 1);
      const eased = easeOutCubic(drawT);
      const count = Math.max(2, Math.round(eased * (SEGMENTS + 1)));

      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const pts = curveData.current;
      for (let i = 0; i < count; i++) posAttr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
      posAttr.needsUpdate = true;
      geo.setDrawRange(0, count);
      geo.computeBoundingSphere();

      const color = RED.clone().lerp(CYAN, eased);
      mat.color.copy(color);
      headMat.color.copy(color);

      const headPoint = pts[Math.min(count - 1, pts.length - 1)];
      if (headRef.current) {
        headRef.current.position.copy(headPoint);
        const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.18;
        headRef.current.scale.setScalar(drawT < 1 ? 0.9 : pulse);
      }
      if (labelGroupRef.current) labelGroupRef.current.position.copy(headPoint).add(new THREE.Vector3(0, 0.85, 0));

      if (labelRef.current) {
        if (drawT < 1) {
          labelRef.current.textContent = `TRACING SIGNAL · ${Math.round(drawT * 100)}%`;
          labelRef.current.style.opacity = "1";
          labelRef.current.style.borderColor = "rgba(244,67,108,0.6)";
        } else {
          const state = useSim.getState().state;
          const risk = assetId ? (state.assets[assetId]?.failureProb7d ?? 0) : 0;
          const assetName = assetId ? getModel().assetById.get(assetId)?.name ?? assetId : "";
          const holdT = clamp((elapsed - DRAW_DURATION) / 0.4, 0, 1);
          labelRef.current.textContent = `MATCH ${Math.round(risk * 100)}% · ${assetName}`;
          labelRef.current.style.opacity = String(holdT);
          labelRef.current.style.borderColor = "rgba(94,234,212,0.6)";
        }
      }

      if (elapsed > DRAW_DURATION + HOLD_DURATION) useTrace.getState().clear();
    }

    pollAcc.current += dt;
    if (pollAcc.current > AUTO_POLL_S) {
      pollAcc.current = 0;
      const now = performance.now();
      const st = useSim.getState().state;
      const model = getModel();

      if (!useTrace.getState().active && now - lastAutoAt.current > AUTO_COOLDOWN_MS) {
        for (const al of Object.values(st.alerts)) {
          if (seenAlerts.current.has(al.id)) continue;
          seenAlerts.current.add(al.id);
          if (al.resolvedAt || al.targetKind !== "asset") continue;
          if (al.kind !== "asset-risk" && al.kind !== "failure") continue;
          const room = sampleServedRoom(model, st, al.targetId);
          if (room) {
            useTrace.getState().start(room, al.targetId, true);
            lastAutoAt.current = now;
          }
          break;
        }
      }

      // A guest complaint tied to a room whose floor already has elevated maintenance
      // risk is worth auto-investigating — a "waited too long at the restaurant" complaint
      // isn't, so this only fires when the physical correlation is plausible.
      if (!useTrace.getState().active && now - lastAutoAt.current > AUTO_COOLDOWN_MS) {
        for (const m of st.chat.slice(-15)) {
          if (seenChat.current.has(m.id)) continue;
          seenChat.current.add(m.id);
          if (m.role !== "concierge" || m.intent !== "complaint" || !m.roomId) continue;
          const roomState = st.rooms[m.roomId];
          if (!roomState || roomState.maintRisk < 0.3) continue;
          const worst = worstAssetForRoom(model, st, m.roomId);
          if (worst) {
            useTrace.getState().start(m.roomId, worst.id, true);
            lastAutoAt.current = now;
          }
          break;
        }
      }
    }
  });

  if (!active || !roomId || !assetId) return null;

  return (
    <group>
      <primitive object={lineObj} />
      <mesh ref={headRef} geometry={headGeo} material={headMat} />
      <group ref={labelGroupRef}>
        <Html center zIndexRange={[7, 0]} style={{ pointerEvents: "none" }}>
          <div ref={labelRef} className="mono whitespace-nowrap rounded-md border bg-void/85 px-2 py-1 text-[10px] tracking-wide text-hi backdrop-blur-md">
            {auto ? "AUTO-INVESTIGATION" : "TRACING SIGNAL"}
          </div>
        </Html>
      </group>
    </group>
  );
}
