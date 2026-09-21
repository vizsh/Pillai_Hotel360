import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const inv = (a: number, b: number, v: number) => (v - a) / (b - a);
export const remap = (v: number, a: number, b: number, c: number, d: number) =>
  lerp(c, d, clamp(inv(a, b, v), 0, 1));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export const randRange = (r: Rand, min: number, max: number) => min + r() * (max - min);
export const randInt = (r: Rand, min: number, max: number) => Math.floor(randRange(r, min, max + 1));
export const pick = <T,>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export function gaussian(r: Rand, mean = 0, sd = 1) {
  const u = 1 - r();
  const v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const fmtINR = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");
export const fmtPct = (n: number, d = 1) => (n * 100).toFixed(d) + "%";
export const fmtNum = (n: number, d = 0) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
