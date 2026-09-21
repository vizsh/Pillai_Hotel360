import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { getModel, defaultConfig } from "@/lib/architecture/model";
import { seedState } from "@/lib/sim/seed";
import type { Scenario, SimState } from "@/lib/sim/types";

interface SimStore {
  state: SimState;
  version: number;
  reset: (scenario?: Scenario, seed?: number) => void;
  setSpeed: (speed: number) => void;
  setPaused: (paused: boolean) => void;
  mutate: (fn: (s: SimState) => void) => void;
  /** Replaces the live state wholesale with one restored from a persisted snapshot
   * (lib/api/backend.ts's fetchLatestSnapshot) — distinct from reset(), which reseeds
   * fresh rather than restoring exact prior state. */
  restoreState: (state: SimState) => void;
  bump: () => void;
}

export const useSim = create<SimStore>()(
  subscribeWithSelector((set, get) => ({
    state: seedState(getModel(), defaultConfig.seed, "peak-season"),
    version: 0,
    reset: (scenario = get().state.scenario, seed = get().state.seed) =>
      set({ state: seedState(getModel(), seed, scenario), version: get().version + 1 }),
    setSpeed: (speed) => {
      get().state.speed = speed;
      set({ version: get().version + 1 });
    },
    setPaused: (paused) => {
      get().state.paused = paused;
      set({ version: get().version + 1 });
    },
    mutate: (fn) => {
      fn(get().state);
      set({ version: get().version + 1 });
    },
    restoreState: (state) => set({ state, version: get().version + 1 }),
    bump: () => set({ version: get().version + 1 }),
  })),
);

export const simState = () => useSim.getState().state;

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __sim: typeof useSim }).__sim = useSim;
