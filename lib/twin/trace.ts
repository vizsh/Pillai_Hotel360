import type { ResortModel, Vec3 } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import type { ViewMode } from "@/store/twin";
import { EXPLODE_GAP } from "@/components/twin/FloorGroup";

function yOff(viewMode: ViewMode, floor: number) {
  return viewMode === "exploded" ? floor * EXPLODE_GAP : 0;
}

export function roomAnchor(model: ResortModel, roomId: string, viewMode: ViewMode): Vec3 | null {
  const r = model.roomById.get(roomId);
  if (!r) return null;
  return [r.center[0], r.center[1] + r.h * 0.55 + yOff(viewMode, r.floor), r.center[2]];
}

export function assetAnchor(model: ResortModel, assetId: string, viewMode: ViewMode): Vec3 | null {
  const a = model.assetById.get(assetId);
  if (!a) return null;
  return [a.position[0], a.position[1] + a.size[1] * 0.5 + yOff(viewMode, a.floor), a.position[2]];
}

/** The asset most likely responsible for a room's problems: highest weighted 7-day failure risk among assets serving its floor. */
export function worstAssetForRoom(model: ResortModel, state: SimState, roomId: string): { id: string; risk: number } | null {
  const r = model.roomById.get(roomId);
  if (!r) return null;
  let best: { id: string; risk: number } | null = null;
  for (const a of model.assets) {
    if (!a.servesFloors.includes(r.floor)) continue;
    const raw = state.assets[a.id]?.failureProb7d ?? 0;
    const weight = a.kind === "ahu" ? 1 : a.kind === "chiller" ? 0.85 : 0.5;
    const risk = raw * weight;
    if (!best || risk > best.risk) best = { id: a.id, risk };
  }
  return best;
}

/** A representative room served by an asset, preferring an occupied one so the trace lands on a guest. */
export function sampleServedRoom(model: ResortModel, state: SimState, assetId: string): string | null {
  const a = model.assetById.get(assetId);
  if (!a) return null;
  const rooms = model.rooms.filter((r) => a.servesFloors.includes(r.floor));
  const occupied = rooms.find((r) => state.rooms[r.id]?.guestId);
  return (occupied ?? rooms[0])?.id ?? null;
}
