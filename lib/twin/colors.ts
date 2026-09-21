import * as THREE from "three";
import type { RoomCell } from "@/lib/architecture/types";
import type { RoomState, RoomStatus } from "@/lib/sim/types";
import type { LayerId } from "@/store/twin";
import { clamp } from "@/lib/utils";

export const statusColors: Record<RoomStatus, string> = {
  "vacant-clean": "#22364a",
  "vacant-dirty": "#f5a524",
  cleaning: "#8ea2bd",
  occupied: "#2dd4bf",
  vip: "#f5d26b",
  ooo: "#f4436c",
};

export const statusLabels: Record<RoomStatus, string> = {
  "vacant-clean": "Vacant · Clean",
  "vacant-dirty": "Vacant · Dirty",
  cleaning: "Cleaning",
  occupied: "Occupied",
  vip: "VIP In-house",
  ooo: "Out of Order",
};

const c = (h: string) => new THREE.Color(h);

export const ramps = {
  cyan: [c("#0a1a2e"), c("#146e6a"), c("#2dd4bf"), c("#5eead4")],
  heat: [c("#14263a"), c("#5b6879"), c("#f5a524"), c("#f4436c")],
  diverging: [c("#f4436c"), c("#5b6879"), c("#2a3647"), c("#34d399")],
} as const;

export function rampColor(ramp: readonly THREE.Color[], t: number, out = new THREE.Color()) {
  const x = clamp(t, 0, 0.9999) * (ramp.length - 1);
  const i = Math.floor(x);
  return out.copy(ramp[i]).lerp(ramp[i + 1], x - i);
}

const statusColorCache = Object.fromEntries(
  Object.entries(statusColors).map(([k, v]) => [k, c(v)]),
) as Record<RoomStatus, THREE.Color>;

export function roomLayerValue(layer: LayerId, cell: RoomCell, st: RoomState): number {
  switch (layer) {
    case "maintenance":
      return st.maintRisk;
    case "sentiment":
      return st.sentiment === null ? -1 : (st.sentiment + 1) / 2;
    case "revenue":
      return clamp(st.revenue7d / (7 * 30000), 0, 1);
    case "housekeeping":
      return clamp(st.hkMinutes / 45, 0, 1);
    case "energy":
      return clamp(st.energyKwh / 48, 0, 1);
    default:
      return 0;
  }
}

export function roomColor(layer: LayerId, cell: RoomCell, st: RoomState, out = new THREE.Color()): THREE.Color {
  switch (layer) {
    case "occupancy":
      return out.copy(statusColorCache[st.status]);
    case "maintenance":
      return rampColor(ramps.heat, st.maintRisk, out);
    case "sentiment":
      if (st.sentiment === null) return out.copy(ramps.cyan[0]);
      return rampColor(ramps.diverging, (st.sentiment + 1) / 2, out);
    case "revenue":
      return rampColor(ramps.cyan, roomLayerValue(layer, cell, st), out);
    case "housekeeping":
      return rampColor(ramps.heat, roomLayerValue(layer, cell, st), out);
    case "energy": {
      const v = roomLayerValue(layer, cell, st);
      if (st.conditioned && !st.guestId) return rampColor(ramps.heat, 0.6 + v * 0.4, out);
      return rampColor(ramps.cyan, v, out);
    }
  }
}

export const deptColors: Record<string, string> = {
  housekeeping: "#f5a524",
  engineering: "#2dd4bf",
  fnb: "#c084fc",
  frontdesk: "#60a5fa",
  concierge: "#34d399",
  spa: "#f472b6",
  security: "#94a3b8",
};

export const severityColors = {
  info: "#2dd4bf",
  warn: "#f5a524",
  critical: "#f4436c",
} as const;
