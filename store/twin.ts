import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type ViewMode = "orbit" | "exploded" | "isolate" | "xray" | "room" | "top" | "facade" | "site";

export type LayerId =
  | "occupancy"
  | "maintenance"
  | "sentiment"
  | "revenue"
  | "housekeeping"
  | "energy";

export type SelectionKind = "room" | "asset" | "zone" | "staff" | "guest";

export interface Selection {
  kind: SelectionKind;
  id: string;
}

interface TwinStore {
  viewMode: ViewMode;
  isolatedFloor: number | null;
  activeLayer: LayerId;
  showStaff: boolean;
  showGuests: boolean;
  showAlerts: boolean;
  showLabels: boolean;
  showInventory: boolean;
  selected: Selection | null;
  hovered: Selection | null;
  tourPlaying: boolean;
  setViewMode: (m: ViewMode) => void;
  setIsolatedFloor: (f: number | null) => void;
  setLayer: (l: LayerId) => void;
  toggle: (k: "showStaff" | "showGuests" | "showAlerts" | "showLabels" | "showInventory") => void;
  select: (s: Selection | null) => void;
  hover: (s: Selection | null) => void;
  setTour: (p: boolean) => void;
}

export const useTwin = create<TwinStore>()(
  subscribeWithSelector((set) => ({
    viewMode: "orbit",
    isolatedFloor: null,
    activeLayer: "occupancy",
    showStaff: true,
    showGuests: false,
    showAlerts: true,
    showLabels: true,
    showInventory: false,
    selected: null,
    hovered: null,
    tourPlaying: false,
    setViewMode: (viewMode) =>
      set((s) => ({
        viewMode,
        isolatedFloor: viewMode === "isolate" ? (s.isolatedFloor ?? 3) : viewMode === "room" ? s.isolatedFloor : null,
        tourPlaying: false,
      })),
    setIsolatedFloor: (isolatedFloor) =>
      set((s) => ({ isolatedFloor, viewMode: isolatedFloor === null && s.viewMode === "isolate" ? "orbit" : s.viewMode === "room" ? "room" : "isolate" })),
    setLayer: (activeLayer) => set({ activeLayer }),
    toggle: (k) => set((s) => ({ [k]: !s[k] })),
    select: (selected) => set({ selected }),
    hover: (hovered) => set({ hovered }),
    setTour: (tourPlaying) => set({ tourPlaying }),
  })),
);

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __twin: typeof useTwin }).__twin = useTwin;

export const layerMeta: Record<LayerId, { label: string; short: string; description: string; kind: "categorical" | "sequential" | "diverging" }> = {
  occupancy: { label: "Occupancy", short: "OCC", description: "Room state: vacant, dirty, occupied, VIP, out of order.", kind: "categorical" },
  maintenance: { label: "Maintenance Risk", short: "RISK", description: "Predicted 7-day failure probability attached to the assets serving each room.", kind: "sequential" },
  sentiment: { label: "Sentiment", short: "SENT", description: "Aspect-scored guest sentiment for the in-house guest of each room.", kind: "diverging" },
  revenue: { label: "Revenue", short: "REV", description: "Trailing 7-day RevPAR contribution per room.", kind: "sequential" },
  housekeeping: { label: "Housekeeping", short: "HK", description: "Outstanding housekeeping minutes and queue position.", kind: "sequential" },
  energy: { label: "Energy", short: "kWh", description: "Estimated daily conditioning energy, flagged when spent on vacant rooms.", kind: "sequential" },
};
