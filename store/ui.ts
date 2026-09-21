import { create } from "zustand";

type MobilePanel = "none" | "left" | "right" | "dock";

interface UiStore {
  twinReady: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  mobilePanel: MobilePanel;
  setTwinReady: (v: boolean) => void;
  setPalette: (v: boolean) => void;
  setHelp: (v: boolean) => void;
  setMobilePanel: (p: MobilePanel) => void;
}

export const useUi = create<UiStore>((set) => ({
  twinReady: false,
  paletteOpen: false,
  helpOpen: false,
  mobilePanel: "none",
  setTwinReady: (twinReady) => set({ twinReady }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setHelp: (helpOpen) => set({ helpOpen }),
  setMobilePanel: (mobilePanel) => set((s) => ({ mobilePanel: s.mobilePanel === mobilePanel ? "none" : mobilePanel })),
}));
