import type { ResortModel, RoomType } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

/** Assets whose failure makes a room genuinely unlivable, not just inconvenient — scoped
 * to AHUs, which serve one floor each. Chillers in this model serve every guest floor as
 * redundant central plant (either can carry the load), so a single chiller failing doesn't
 * strip cooling from a specific, relocatable set of rooms the way a floor's AHU going down
 * does; that's a maintenance/risk event, not a "move these guests" event. */
const CLIMATE_KINDS = new Set(["ahu"]);
const typeRank: Record<RoomType, number> = { standard: 0, accessible: 0, deluxe: 1, suite: 2 };

export interface RelocationPair {
  guestId: string;
  guestName: string;
  fromRoomId: string;
  fromRoomNumber: string;
  toRoomId: string;
  toRoomNumber: string;
  upgrade: boolean;
}

export interface GuestImpactAssessment {
  assetId: string;
  assetName: string;
  affectedRoomCount: number;
  affectedGuestCount: number;
  pairs: RelocationPair[];
  unplaced: number;
}

export function assessGuestImpact(state: SimState, model: ResortModel, assetId: string): GuestImpactAssessment | null {
  const asset = model.assetById.get(assetId);
  if (!asset || !CLIMATE_KINDS.has(asset.kind)) return null;

  const affectedRooms = model.rooms.filter((r) => asset.servesFloors.includes(r.floor));
  const affectedGuestRooms = affectedRooms.filter((r) => state.rooms[r.id]?.guestId);
  const vacant = model.rooms
    .filter((r) => state.rooms[r.id]?.status === "vacant-clean" && !asset.servesFloors.includes(r.floor))
    .sort((a, b) => typeRank[b.type] - typeRank[a.type]);

  const used = new Set<string>();
  const pairs: RelocationPair[] = [];
  for (const r of affectedGuestRooms) {
    const st = state.rooms[r.id];
    const guest = state.guests[st.guestId!];
    const target = vacant.find((v) => !used.has(v.id) && typeRank[v.type] >= typeRank[r.type]) ?? vacant.find((v) => !used.has(v.id));
    if (!target || !guest) continue;
    used.add(target.id);
    pairs.push({
      guestId: guest.id,
      guestName: guest.name,
      fromRoomId: r.id,
      fromRoomNumber: r.number,
      toRoomId: target.id,
      toRoomNumber: target.number,
      upgrade: typeRank[target.type] > typeRank[r.type],
    });
  }

  return {
    assetId,
    assetName: asset.name,
    affectedRoomCount: affectedRooms.length,
    affectedGuestCount: affectedGuestRooms.length,
    pairs,
    unplaced: affectedGuestRooms.length - pairs.length,
  };
}

export function guestImpactRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const out: Recommendation[] = [];
  for (const asset of model.assets) {
    if (!CLIMATE_KINDS.has(asset.kind)) continue;
    const st = state.assets[asset.id];
    if (!st || st.status !== "failed") continue;
    const impact = assessGuestImpact(state, model, asset.id);
    if (!impact || impact.pairs.length === 0) continue;
    out.push({
      id: `rec-relocate-${asset.id}`,
      module: "relocation",
      title: `Relocate ${impact.pairs.length} guest${impact.pairs.length > 1 ? "s" : ""} off ${impact.assetName}`,
      body: `${impact.assetName} is down and no longer conditions ${impact.affectedRoomCount} rooms (${impact.affectedGuestCount} occupied). ${impact.pairs.length} of ${impact.affectedGuestCount} can move into vacant-clean rooms outside its zone right now${impact.unplaced ? `; ${impact.unplaced} have no vacancy match yet` : ""}.`,
      confidence: clamp(0.65 + (impact.pairs.length / Math.max(1, impact.affectedGuestCount)) * 0.25, 0, 0.92),
      basis: [
        `${impact.affectedRoomCount} rooms served by ${impact.assetName}, matched against vacant-clean inventory outside its zone`,
        `target rooms chosen at same-or-better type; ${impact.pairs.filter((p) => p.upgrade).length} are complimentary upgrades`,
        ...impact.pairs.slice(0, 4).map((p) => `${p.guestName}: ${p.fromRoomNumber} → ${p.toRoomNumber}${p.upgrade ? " (upgrade)" : ""}`),
      ],
      impact: `Avoids service-recovery cost on ${impact.pairs.length} stays and the sentiment decay of staying in an unconditioned room.`,
      action: `Relocate ${impact.pairs.length} guest${impact.pairs.length > 1 ? "s" : ""} and escort each to their new room.`,
      targetKind: "asset",
      targetId: asset.id,
      createdAt: state.t,
      status: "pending",
      payload: { pairs: impact.pairs },
    });
  }
  return out;
}
