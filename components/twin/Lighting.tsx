"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { useProfile } from "@/store/quality";
import { useSim } from "@/store/sim";
import { DAY, HOUR } from "@/lib/sim/seed";
import { computeSky, skyRuntime } from "@/lib/twin/sky";

const SUN_R = 220;

export function Lighting() {
  const p = useProfile();
  const sun = useRef<THREE.DirectionalLight>(null!);
  const rim = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const { scene } = useThree();
  const fog = useRef(new THREE.Fog("#05070a", 160, 420));
  const skyOut = useRef({ bg: new THREE.Color(), fog: new THREE.Color(), sunColor: new THREE.Color(), ambientColor: new THREE.Color() });

  useFrame(() => {
    const t = useSim.getState().state.t;
    const hour = (t % DAY) / HOUR;
    const sky = computeSky(hour, skyOut.current);
    skyRuntime.hour = hour;
    skyRuntime.nightFactor = sky.nightFactor;

    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
    (scene.background as THREE.Color).copy(sky.bg);
    fog.current.color.copy(sky.fog);
    scene.fog = fog.current;

    if (sun.current) {
      const az = sky.sunAzimuth;
      const el = sky.sunElevation;
      sun.current.position.set(Math.cos(az) * SUN_R, Math.max(6, el) * SUN_R * 0.55 + 25, Math.sin(az) * SUN_R);
      sun.current.color.copy(sky.sunColor);
      sun.current.intensity = sky.sunIntensity;
    }
    if (rim.current) rim.current.intensity = 0.15 + sky.nightFactor * 0.25;
    if (hemi.current) {
      hemi.current.color.copy(sky.ambientColor);
      hemi.current.intensity = sky.ambientIntensity;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#2a4a6a", "#0a0f14", 0.55]} />
      <directionalLight
        ref={sun}
        intensity={1.6}
        color="#dfe9ff"
        castShadow={p.shadows}
        shadow-mapSize={[p.shadowMap, p.shadowMap]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={10}
        shadow-camera-far={340}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={rim} position={[70, 40, 60]} intensity={0.35} color="#2dd4bf" />
      <pointLight position={[0, 8, -55]} intensity={40} color="#0fb7d6" distance={60} decay={2} />
      {/* Procedural — not a fetched HDRI. Keeps the twin fully self-contained (no runtime
          CDN dependency to fail on unreliable venue wifi mid-demo) while still giving the
          glass/metal materials real reflections to catch. A couple more formers than
          before, at a higher resolution, for richer variation across the curtain wall. */}
      <Environment resolution={384} frames={1} environmentIntensity={0.9}>
        <color attach="background" args={["#070b12"]} />
        <Lightformer form="rect" intensity={3} color="#cfe3ff" position={[0, 40, -60]} scale={[80, 20, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#2dd4bf" position={[60, 10, 30]} scale={[30, 12, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#f5a524" position={[-60, 6, 30]} scale={[20, 8, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.5} color="#8fb8ff" position={[0, 80, 0]} scale={[40, 40, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#04365a" position={[0, -20, 0]} scale={[200, 200, 1]} rotation-x={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.9} color="#ffe8c4" position={[-40, 22, -40]} scale={[24, 10, 1]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={0.6} color="#9fd8ff" position={[40, 50, 40]} scale={[18, 18, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  );
}
