"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, AdaptiveDpr, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Lighting } from "./Lighting";
import { Effects } from "./Effects";
import { CameraRig } from "./CameraRig";
import { Resort } from "./Resort";
import { StaffAgents } from "./StaffAgents";
import { Markers } from "./Markers";
import { FaultTrace } from "./FaultTrace";
import { DebugBridge, ReadySignal } from "./DebugBridge";
import { GuestFlow } from "./GuestFlow";
import { Tour, IdleOrbit } from "./Tour";
import { useProfile, useQuality } from "@/store/quality";
import { useTwin } from "@/store/twin";

export function TwinCanvas() {
  const p = useProfile();
  const { degrade, upgrade, setFps } = useQuality();
  return (
    <Canvas
      shadows={p.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      dpr={p.dpr}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      camera={{ fov: 42, near: 0.5, far: 900, position: [80, 60, -90] }}
      onPointerMissed={() => useTwin.getState().select(null)}
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0b1420 0%, #05070a 70%)" }}
    >
      <PerformanceMonitor
        onDecline={() => {
          if (!document.hidden) degrade();
        }}
        onIncline={() => {
          if (!document.hidden) upgrade();
        }}
        onChange={({ fps }) => setFps(Math.round(fps))}
        flipflops={2}
        ms={600}
        iterations={8}
        bounds={() => [40, 58]}
      />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        <Lighting />
        <Resort />
        <StaffAgents />
        <GuestFlow />
        <Markers />
        <FaultTrace />
        <Tour />
        <IdleOrbit />
        <ReadySignal />
        <ContactShadows position={[0, 0.01, -20]} opacity={0.5} scale={280} blur={2.4} far={60} resolution={1024} color="#000000" />
        <Effects />
      </Suspense>
      <CameraRig />
      <DebugBridge />
    </Canvas>
  );
}
