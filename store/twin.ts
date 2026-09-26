import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type ViewMode = "orbit" | "exploded" | "isolate" | "xray" | "room" | "top" | "facade" | "site";

export type LayerId =
  | "risk"
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
  /** Room ids the "show me" feature (Ctrl+K or the ops assistant) is currently pointing the
   * camera at and pulsing a marker over — orthogonal to `selected` (a single entity the
   * sidebar shows detail for). Cleared by dismissing the caption or picking a new query. */
  highlighted: string[];
  askCaption: string | null;
  tourPlaying: boolean;
  setViewMode: (m: ViewMode) => void;
  setIsolatedFloor: (f: number | null) => void;
  setLayer: (l: LayerId) => void;
  toggle: (k: "showStaff" | "showGuests" | "showAlerts" | "showLabels" | "showInventory") => void;
  select: (s: Selection | null) => void;
  hover: (s: Selection | null) => void;
  setTour: (p: boolean) => void;
  ask: (rooms: string[], caption: string) => void;
  dismissAsk: () => void;
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
    highlighted: [],
    askCaption: null,
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
    ask: (highlighted, askCaption) => set({ highlighted, askCaption }),
    dismissAsk: () => set({ highlighted: [], askCaption: null }),
  })),
);

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __twin: typeof useTwin }).__twin = useTwin;

export const layerMeta: Record<LayerId, { label: string; short: string; description: string; kind: "categorical" | "sequential" | "diverging" }> = {
  risk: { label: "Overall Risk", short: "RISK", description: "One composite score per room — blends maintenance failure risk, guest sentiment, housekeeping backlog and energy waste, so every room that needs attention is visible in a single glance.", kind: "sequential" },
  occupancy: { label: "Occupancy", short: "OCC", description: "Room state: vacant, dirty, occupied, VIP, out of order.", kind: "categorical" },
  maintenance: { label: "Maintenance Risk", short: "RISK", description: "Predicted 7-day failure probability attached to the assets serving each room.", kind: "sequential" },
  sentiment: { label: "Sentiment", short: "SENT", description: "Aspect-scored guest sentiment for the in-house guest of each room.", kind: "diverging" },
  revenue: { label: "Revenue", short: "REV", description: "Trailing 7-day RevPAR contribution per room.", kind: "sequential" },
  housekeeping: { label: "Housekeeping", short: "HK", description: "Outstanding housekeeping minutes and queue position.", kind: "sequential" },
  energy: { label: "Energy", short: "kWh", description: "Estimated daily conditioning energy, flagged when spent on vacant rooms.", kind: "sequential" },
};
