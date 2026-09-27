"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTwin } from "@/store/twin";
import { useSim } from "@/store/sim";
import { useWeatherWhatIf } from "@/store/weatherWhatIf";
import { getModel } from "@/lib/architecture/model";
import { forecastWeather } from "@/lib/intelligence/weather";
import type { WeatherCondition } from "@/lib/intelligence/weather";

const RAIN_HEIGHT = 34;
const RAIN_SPEED = 22;

/** Purely presentational — the real weather-driven behaviour is already in GroundFloor.tsx's
 * zone tint and lib/twin/colors.ts's room "weather" layer; this is the "grab attention
 * instantly" layer on top of it. Falling rain when the active/what-if condition is "rain", a
 * warm heat-haze color-grade when it's "heatwave" — both only rendered while the Weather layer
 * is selected, so every other layer's look is completely untouched. Every input is read
 * reactively (useSim's version tick, the what-if store's own fields), not via a one-off
 * getState() snapshot, so this actually re-renders when the day's weather advances or the
 * what-if scenario changes rather than only when the layer itself is toggled. */
function useCurrentCondition(): WeatherCondition {
  const wifActive = useWeatherWhatIf((s) => s.active);
  const wifCondition = useWeatherWhatIf((s) => s.scenario.condition);
  const simState = useSim((s) => s.state);
  useSim((s) => s.version);
  if (wifActive) return wifCondition;
  return forecastWeather(simState)[0].condition;
}

function Rain({ count = 900 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);
  const model = getModel();
  const L = model.dims.length / 2 + 6;
  const D = model.dims.depth / 2 + 6;

  // Random drop placement is genuinely non-deterministic on purpose (it's rain, not a fixed
  // pattern) — done inside an effect (runs once after mount, not during render) rather than a
  // useMemo, since calling Math.random() while computing a render value is an impurity React's
  // own lint rule now flags even when memoized.
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  const velocitiesRef = useRef<Float32Array>(new Float32Array(0));
  useEffect(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * L;
      positions[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * D;
      velocities[i] = RAIN_SPEED * (0.7 + Math.random() * 0.6);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    velocitiesRef.current = velocities;
  }, [count, L, D, geometry]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#bcd9e6",
        size: 0.22,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame((_, dt) => {
    const velocities = velocitiesRef.current;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos || !velocities.length) return; // effect hasn't populated the geometry yet on this exact frame
    for (let i = 0; i < velocities.length; i++) {
      let y = pos.getY(i) - velocities[i] * dt;
      if (y < 0) y = RAIN_HEIGHT;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />;
}

function HeatHaze() {
  const model = getModel();
  const L = model.dims.length / 2 + 10;
  const D = model.dims.depth / 2 + 10;
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.06 + Math.sin(clock.elapsedTime * 0.6) * 0.02;
  });
  return (
    <mesh ref={ref} position={[0, 30, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[L * 2, D * 2]} />
      <meshBasicMaterial color="#f5a524" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

export function WeatherFX() {
  const activeLayer = useTwin((s) => s.activeLayer);
  const condition = useCurrentCondition();
  if (activeLayer !== "weather" || condition === "clear") return null;
  if (condition === "rain") return <Rain />;
  return <HeatHaze />;
}
