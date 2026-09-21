import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, RoomState, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

/** kWh/h a conditioned vs unconditioned room draws — mirrors the same constants the
 * tick loop uses for r.energyKwh, so this module's numbers reconcile with the live meter. */
const CONDITIONED_RATE = 1.55;
const UNCONDITIONED_RATE = 0.18;
const ECO_RATE = 0.6;
const WASTE_RATE = CONDITIONED_RATE - UNCONDITIONED_RATE;
const ECO_SAVING_RATE = CONDITIONED_RATE - ECO_RATE;
/** ₹/kWh, representative commercial tariff — see moduleMeta description for the sourcing note. */
const COST_PER_KWH = 9;
/** Below this many candidate rooms, a resort-wide recommendation isn't worth surfacing —
 * matches how pricing/staffing avoid recommending on noise-level signals. */
const MIN_CANDIDATES = 3;
const MIN_AWAY_CANDIDATES = 2;
/** Camera presence confidence below which a PMS-occupied room reads as "guest out." */
const AWAY_THRESHOLD = 0.15;

export interface EnergyWasteAssessment {
  candidates: RoomState[];
  wasteKwhPerDay: number;
  wasteCostPerDay: number;
  managedCount: number;
  awayCandidates: RoomState[];
  awayWasteKwhPerDay: number;
  awayWasteCostPerDay: number;
  ecoCount: number;
}

/** Vacant rooms still drawing full conditioning load — the exact "empty room, full AC"
 * gap that accounts for an estimated 35-40% of hotel HVAC energy industry-wide. Rooms
 * already held off by an accepted recommendation (energyManaged) aren't re-flagged.
 *
 * awayCandidates is the sharper signal: rooms the PMS calls occupied (guest checked in,
 * checkout not due) whose camera-derived presence confidence has stayed low — a guest at
 * the pool, not a vacant room. PMS occupancy alone can't see this; a presence feed can. */
export function assessEnergyWaste(state: SimState, model: ResortModel): EnergyWasteAssessment {
  const rooms = model.rooms.map((r) => state.rooms[r.id]);
  const candidates = rooms.filter((r) => !r.guestId && r.conditioned && !r.energyManaged && r.status !== "ooo");
  const managedCount = rooms.filter((r) => r.energyManaged && !r.conditioned && !r.guestId).length;
  const wasteKwhPerDay = candidates.length * WASTE_RATE * 24;

  const awayCandidates = rooms.filter((r) => r.guestId && r.conditioned && !r.ecoMode && r.presence < AWAY_THRESHOLD);
  const ecoCount = rooms.filter((r) => r.ecoMode).length;
  const awayWasteKwhPerDay = awayCandidates.length * ECO_SAVING_RATE * 24;

  return {
    candidates,
    wasteKwhPerDay,
    wasteCostPerDay: wasteKwhPerDay * COST_PER_KWH,
    managedCount,
    awayCandidates,
    awayWasteKwhPerDay,
    awayWasteCostPerDay: awayWasteKwhPerDay * COST_PER_KWH,
    ecoCount,
  };
}

export function energyRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const a = assessEnergyWaste(state, model);
  const out: Recommendation[] = [];

  if (a.candidates.length >= MIN_CANDIDATES) {
    const roomIds = a.candidates.map((r) => r.id);
    const sample = a.candidates.slice(0, 4).map((r) => model.roomById.get(r.id)!.number);
    out.push({
      id: "rec-energy-vacant-conditioning",
      module: "energy",
      title: `Un-condition ${a.candidates.length} vacant room${a.candidates.length > 1 ? "s" : ""}`,
      body: `${a.candidates.length} vacant rooms (no guest, not arriving imminently) are still drawing full conditioning load — ${CONDITIONED_RATE} kWh/h against ${UNCONDITIONED_RATE} kWh/h unconditioned. Rooms: ${sample.join(", ")}${a.candidates.length > sample.length ? "…" : ""}.`,
      confidence: clamp(0.55 + Math.min(0.3, a.candidates.length / 25), 0, 0.9),
      basis: [
        `${a.candidates.length} rooms × ${WASTE_RATE.toFixed(2)} kWh/h waste delta × 24h = ${a.wasteKwhPerDay.toFixed(0)} kWh/day`,
        `at ₹${COST_PER_KWH}/kWh ≈ ₹${Math.round(a.wasteCostPerDay).toLocaleString("en-IN")}/day if left conditioned`,
        `conditioning auto-resumes the moment any of these rooms checks in`,
      ],
      impact: `Avoids ≈₹${Math.round(a.wasteCostPerDay).toLocaleString("en-IN")}/day in wasted HVAC load with zero guest-facing effect — none of these rooms are occupied.`,
      action: `Disable conditioning in ${a.candidates.length} vacant room${a.candidates.length > 1 ? "s" : ""}.`,
      targetKind: "resort",
      targetId: "energy",
      createdAt: state.t,
      status: "pending",
      payload: { mode: "vacant", roomIds },
    });
  }

  if (a.awayCandidates.length >= MIN_AWAY_CANDIDATES) {
    const roomIds = a.awayCandidates.map((r) => r.id);
    const sample = a.awayCandidates.slice(0, 4).map((r) => model.roomById.get(r.id)!.number);
    out.push({
      id: "rec-energy-away-mode",
      module: "energy",
      title: `Eco setback in ${a.awayCandidates.length} occupied room${a.awayCandidates.length > 1 ? "s" : ""} — guests away`,
      body: `${a.awayCandidates.length} checked-in rooms show sustained low camera presence confidence (guest likely at the pool, restaurant, or off-property) despite the PMS marking them occupied. Rooms: ${sample.join(", ")}${a.awayCandidates.length > sample.length ? "…" : ""}.`,
      confidence: clamp(0.5 + Math.min(0.25, a.awayCandidates.length / 20), 0, 0.85),
      basis: [
        `presence confidence < ${(AWAY_THRESHOLD * 100).toFixed(0)}% (camera feed, simulated) while PMS status remains occupied`,
        `${a.awayCandidates.length} rooms × ${ECO_SAVING_RATE.toFixed(2)} kWh/h eco-setback delta × 24h = ${a.awayWasteKwhPerDay.toFixed(0)} kWh/day`,
        `full conditioning restores automatically the moment presence confidence recovers above 60%`,
      ],
      impact: `Avoids ≈₹${Math.round(a.awayWasteCostPerDay).toLocaleString("en-IN")}/day without touching a room whose guest might return any minute — setback, not shutoff.`,
      action: `Enable eco setback in ${a.awayCandidates.length} occupied room${a.awayCandidates.length > 1 ? "s" : ""}.`,
      targetKind: "resort",
      targetId: "energy",
      createdAt: state.t,
      status: "pending",
      payload: { mode: "away", roomIds },
    });
  }

  return out;
}
