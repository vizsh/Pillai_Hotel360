import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ModuleId } from "@/lib/sim/types";

type MobilePanel = "none" | "left" | "right" | "dock";

interface UiStore {
  twinReady: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  whatIfOpen: boolean;
  /** Global demo mode: when true, every pending recommendation in BottomDock.tsx counts down
   * and auto-executes through the exact same acceptRecommendation() a manual click would call
   * — a real, reversible glimpse of "what if this ran itself," not a scripted fake sequence.
   * Toggling this off mid-countdown cancels every pending timer immediately (each RecCard's own
   * effect depends on this flag). Manual mode (the default) is completely unchanged by this
   * feature existing at all. */
  autopilot: boolean;
  mobilePanel: MobilePanel;
  methodologyModule: ModuleId | null;
  setTwinReady: (v: boolean) => void;
  setPalette: (v: boolean) => void;
  setHelp: (v: boolean) => void;
  setWhatIf: (v: boolean) => void;
  setAutopilot: (v: boolean) => void;
  setMobilePanel: (p: MobilePanel) => void;
  openMethodology: (m: ModuleId) => void;
  closeMethodology: () => void;
}

export const useUi = create<UiStore>()(
  subscribeWithSelector((set) => ({
    twinReady: false,
    paletteOpen: false,
    helpOpen: false,
    whatIfOpen: false,
    autopilot: false,
    mobilePanel: "none",
    methodologyModule: null,
    setTwinReady: (twinReady) => set({ twinReady }),
    setPalette: (paletteOpen) => set({ paletteOpen }),
    setHelp: (helpOpen) => set({ helpOpen }),
    setWhatIf: (whatIfOpen) => set({ whatIfOpen }),
    setAutopilot: (autopilot) => set({ autopilot }),
    setMobilePanel: (mobilePanel) => set((s) => ({ mobilePanel: s.mobilePanel === mobilePanel ? "none" : mobilePanel })),
    openMethodology: (methodologyModule) => set({ methodologyModule }),
    closeMethodology: () => set({ methodologyModule: null }),
  })),
);
