import { create } from "zustand";

export type QualityTier = "ultra" | "high" | "balanced" | "potato";

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  shadowMap: number;
  postfx: boolean;
  ssao: boolean;
  bloom: boolean;
  transmission: boolean;
  palms: number;
  particles: boolean;
  labelsCap: number;
}

export const profiles: Record<QualityTier, QualityProfile> = {
  ultra: { dpr: [1, 2], shadows: true, shadowMap: 4096, postfx: true, ssao: true, bloom: true, transmission: true, palms: 1, particles: true, labelsCap: 32 },
  high: { dpr: [1, 1.75], shadows: true, shadowMap: 2048, postfx: true, ssao: false, bloom: true, transmission: true, palms: 1, particles: true, labelsCap: 24 },
  balanced: { dpr: [1, 1.25], shadows: true, shadowMap: 1024, postfx: true, ssao: false, bloom: true, transmission: false, palms: 0.6, particles: true, labelsCap: 16 },
  potato: { dpr: [0.75, 1], shadows: false, shadowMap: 512, postfx: false, ssao: false, bloom: false, transmission: false, palms: 0.3, particles: false, labelsCap: 8 },
};

interface QualityStore {
  tier: QualityTier;
  auto: boolean;
  fps: number;
  setTier: (t: QualityTier) => void;
  setAuto: (a: boolean) => void;
  setFps: (f: number) => void;
  degrade: () => void;
  upgrade: () => void;
}

const order: QualityTier[] = ["potato", "balanced", "high", "ultra"];

export const useQuality = create<QualityStore>((set, get) => ({
  tier: "high",
  auto: true,
  fps: 60,
  setTier: (tier) => set({ tier, auto: false }),
  setAuto: (auto) => set({ auto }),
  setFps: (fps) => set({ fps }),
  degrade: () => {
    const i = order.indexOf(get().tier);
    if (i > 0 && get().auto) set({ tier: order[i - 1] });
  },
  upgrade: () => {
    const i = order.indexOf(get().tier);
    if (i < order.length - 1 && get().auto) set({ tier: order[i + 1] });
  },
}));

export const useProfile = () => profiles[useQuality((s) => s.tier)];
