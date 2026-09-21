import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ModuleId } from "@/lib/sim/types";

type MobilePanel = "none" | "left" | "right" | "dock";

interface UiStore {
  twinReady: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  mobilePanel: MobilePanel;
  methodologyModule: ModuleId | null;
  setTwinReady: (v: boolean) => void;
  setPalette: (v: boolean) => void;
  setHelp: (v: boolean) => void;
  setMobilePanel: (p: MobilePanel) => void;
  openMethodology: (m: ModuleId) => void;
  closeMethodology: () => void;
}

export const useUi = create<UiStore>()(
  subscribeWithSelector((set) => ({
    twinReady: false,
    paletteOpen: false,
    helpOpen: false,
    mobilePanel: "none",
    methodologyModule: null,
    setTwinReady: (twinReady) => set({ twinReady }),
    setPalette: (paletteOpen) => set({ paletteOpen }),
    setHelp: (helpOpen) => set({ helpOpen }),
    setMobilePanel: (mobilePanel) => set((s) => ({ mobilePanel: s.mobilePanel === mobilePanel ? "none" : mobilePanel })),
    openMethodology: (methodologyModule) => set({ methodologyModule }),
    closeMethodology: () => set({ methodologyModule: null }),
  })),
);
