import { create } from "zustand";

export const DRAW_DURATION = 1.4;
export const HOLD_DURATION = 3.2;

interface TraceState {
  active: boolean;
  roomId: string | null;
  assetId: string | null;
  startedAt: number;
  auto: boolean;
  start: (roomId: string, assetId: string, auto?: boolean) => void;
  clear: () => void;
}

export const useTrace = create<TraceState>((set) => ({
  active: false,
  roomId: null,
  assetId: null,
  startedAt: 0,
  auto: false,
  start: (roomId, assetId, auto = false) => set({ active: true, roomId, assetId, startedAt: performance.now(), auto }),
  clear: () => set({ active: false, roomId: null, assetId: null }),
}));

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __trace: typeof useTrace }).__trace = useTrace;
