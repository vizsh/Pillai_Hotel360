import * as THREE from "three";
import { clamp, lerp } from "@/lib/utils";

export interface SkyFrame {
  bg: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  sunElevation: number;
  sunAzimuth: number;
  nightFactor: number;
}

interface Key {
  h: number;
  bg: string;
  fog: string;
  sun: string;
  sunI: number;
  amb: string;
  ambI: number;
  elev: number;
  night: number;
}

const KEYS: Key[] = [
  { h: 0, bg: "#03050a", fog: "#03050a", sun: "#1a2a44", sunI: 0.05, amb: "#141c28", ambI: 0.38, elev: -0.65, night: 1 },
  { h: 4.5, bg: "#050a16", fog: "#050a16", sun: "#24345a", sunI: 0.1, amb: "#182234", ambI: 0.4, elev: -0.35, night: 1 },
  { h: 6, bg: "#2a2242", fog: "#241d38", sun: "#ff8a5c", sunI: 0.75, amb: "#3a3250", ambI: 0.55, elev: -0.02, night: 0.55 },
  { h: 7.5, bg: "#6a86ac", fog: "#5a76a0", sun: "#ffd9a0", sunI: 1.55, amb: "#7590b4", ambI: 0.72, elev: 0.3, night: 0.05 },
  { h: 12, bg: "#82b6da", fog: "#6ea6cf", sun: "#fff6e6", sunI: 2.0, amb: "#93c3e2", ambI: 0.9, elev: 0.92, night: 0 },
  { h: 16.5, bg: "#6a9dc6", fog: "#588cb8", sun: "#ffe2ae", sunI: 1.65, amb: "#7bb0d4", ambI: 0.78, elev: 0.35, night: 0.05 },
  { h: 18.3, bg: "#3c3768", fog: "#332e58", sun: "#ff7648", sunI: 0.95, amb: "#4a446c", ambI: 0.55, elev: 0.0, night: 0.5 },
  { h: 19.5, bg: "#161a34", fog: "#131730", sun: "#3a4a72", sunI: 0.18, amb: "#1f2540", ambI: 0.42, elev: -0.2, night: 0.9 },
  { h: 24, bg: "#03050a", fog: "#03050a", sun: "#1a2a44", sunI: 0.05, amb: "#141c28", ambI: 0.38, elev: -0.65, night: 1 },
];

const cache = new Map<string, THREE.Color>();
const col = (hex: string) => {
  let c = cache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    cache.set(hex, c);
  }
  return c;
};

const scratchBg = new THREE.Color();
const scratchFog = new THREE.Color();
const scratchSun = new THREE.Color();
const scratchAmb = new THREE.Color();

export function computeSky(hour: number, out?: Partial<SkyFrame>): SkyFrame {
  const h = ((hour % 24) + 24) % 24;
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i].h && h <= KEYS[i + 1].h) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const span = b.h - a.h || 1;
  const t = clamp((h - a.h) / span, 0, 1);
  return {
    bg: (out?.bg ?? scratchBg).copy(col(a.bg)).lerp(col(b.bg), t),
    fog: (out?.fog ?? scratchFog).copy(col(a.fog)).lerp(col(b.fog), t),
    sunColor: (out?.sunColor ?? scratchSun).copy(col(a.sun)).lerp(col(b.sun), t),
    ambientColor: (out?.ambientColor ?? scratchAmb).copy(col(a.amb)).lerp(col(b.amb), t),
    sunIntensity: lerp(a.sunI, b.sunI, t),
    ambientIntensity: lerp(a.ambI, b.ambI, t),
    sunElevation: lerp(a.elev, b.elev, t),
    sunAzimuth: (h / 24) * Math.PI * 2 - Math.PI / 2,
    nightFactor: lerp(a.night, b.night, t),
  };
}

/** Mutable, per-frame-updated singleton so non-React consumers (materials, instanced colors)
 * can read the current day/night state without subscribing and causing re-renders. */
export const skyRuntime = { hour: 20, nightFactor: 0.9 };
