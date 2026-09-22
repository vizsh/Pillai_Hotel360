import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

/** Below this many occupied group-segment rooms, "the group segment" is statistical noise
 * (2-3 leisure guests who happen to be tagged "group"), not an actual negotiated block
 * worth a rate-floor recommendation. */
const MIN_GROUP_ROOMS = 5;
/** Occupancy above which unfilled transient demand is unlikely to exist — i.e. the block's
 * rooms would very probably have sold at the transient rate anyway. */
const HIGH_OCC_THRESHOLD = 0.85;
/** Occupancy below which the block is plausibly the thing keeping the resort afloat, not
 * something crowding out better-paying demand. */
const LOW_OCC_THRESHOLD = 0.6;
const MIN_DISPLACEMENT_PER_ROOM = 1500;

export interface GroupBlockAssessment {
  groupRooms: number;
  transientRooms: number;
  groupAdr: number;
  transientAdr: number;
  groupShare: number;
  /** ₹/night the group segment is priced under the transient segment for comparable
   * occupied inventory right now — the core "displacement analysis" number. */
  displacementPerRoom: number;
  displacementTotal: number;
  occupancy: number;
}

/** Group/event block vs. transient mix analysis — the standard hotel revenue-management
 * technique of comparing what a negotiated block is paying against what transient demand
 * would pay for the same rooms on the same dates ("displacement analysis"). Reasons over
 * the currently in-house mix: the simulator has no forward reservations pipeline (guests
 * are generated at the moment they check in, not booked ahead of time — see
 * lib/sim/engine.ts's occupancy-deficit arrival model), so this can't evaluate a specific
 * pending group RFP the way a real revenue manager's tool would. It's real math on real
 * (simulated) current state, just scoped to what that state actually contains. */
export function assessGroupBlock(state: SimState, model: ResortModel): GroupBlockAssessment {
  const occRooms = model.rooms.map((r) => state.rooms[r.id]).filter((r) => r.guestId);
  const groupRooms = occRooms.filter((r) => state.guests[r.guestId!]?.segment === "group");
  const transientRooms = occRooms.filter((r) => state.guests[r.guestId!]?.segment !== "group");
  const avgRate = (rows: typeof occRooms) => (rows.length ? rows.reduce((s, r) => s + r.rate, 0) / rows.length : 0);
  const groupAdr = avgRate(groupRooms);
  const transientAdr = avgRate(transientRooms);
  const displacementPerRoom = Math.max(0, transientAdr - groupAdr);
  return {
    groupRooms: groupRooms.length,
    transientRooms: transientRooms.length,
    groupAdr,
    transientAdr,
    groupShare: groupRooms.length / Math.max(1, occRooms.length),
    displacementPerRoom,
    displacementTotal: displacementPerRoom * groupRooms.length,
    occupancy: occRooms.length / Math.max(1, model.rooms.length),
  };
}

export function groupBlockRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const a = assessGroupBlock(state, model);
  const out: Recommendation[] = [];
  if (a.groupRooms < MIN_GROUP_ROOMS) return out;

  if (a.occupancy > HIGH_OCC_THRESHOLD && a.displacementPerRoom > MIN_DISPLACEMENT_PER_ROOM) {
    out.push({
      id: "rec-group-displacement",
      module: "groupblock",
      title: `Raise group rate floor — ₹${Math.round(a.displacementPerRoom).toLocaleString("en-IN")}/night displacement gap`,
      body: `${a.groupRooms} group-segment rooms occupied at ₹${Math.round(a.groupAdr).toLocaleString("en-IN")} ADR vs ₹${Math.round(a.transientAdr).toLocaleString("en-IN")} transient ADR, at ${(a.occupancy * 100).toFixed(0)}% resort-wide occupancy. Demand this strong would very likely have filled these rooms at the transient rate anyway.`,
      confidence: clamp(0.5 + Math.min(0.35, a.displacementTotal / 200000), 0, 0.9),
      basis: [
        `group ADR ₹${Math.round(a.groupAdr).toLocaleString("en-IN")} vs transient ADR ₹${Math.round(a.transientAdr).toLocaleString("en-IN")} (${a.groupRooms} vs ${a.transientRooms} occupied rooms)`,
        `displacement cost ≈ ₹${Math.round(a.displacementTotal).toLocaleString("en-IN")}/night across the current block`,
        `occupancy ${(a.occupancy * 100).toFixed(0)}% is above the ${(HIGH_OCC_THRESHOLD * 100).toFixed(0)}% threshold where group inventory typically has a transient alternative`,
      ],
      impact: `Guidance for the next negotiated block on comparable dates — does not change any rate already booked.`,
      action: `Set group rate floor guidance to ₹${Math.round(a.transientAdr * 0.9).toLocaleString("en-IN")} for future blocks.`,
      targetKind: "resort",
      targetId: "group-blocks",
      createdAt: state.t,
      status: "pending",
      payload: {},
    });
  }

  if (a.occupancy < LOW_OCC_THRESHOLD && a.groupShare > 0.3) {
    out.push({
      id: "rec-group-protect",
      module: "groupblock",
      title: `Group block is protecting occupancy — hold current rate`,
      body: `${a.groupRooms} group rooms are ${(a.groupShare * 100).toFixed(0)}% of occupied inventory at ${(a.occupancy * 100).toFixed(0)}% resort-wide occupancy. Below ${(LOW_OCC_THRESHOLD * 100).toFixed(0)}%, transient demand alone likely wouldn't fill this inventory.`,
      confidence: 0.6,
      basis: [`occupancy ${(a.occupancy * 100).toFixed(0)}% below the ${(LOW_OCC_THRESHOLD * 100).toFixed(0)}% floor`, `group share ${(a.groupShare * 100).toFixed(0)}% of occupied rooms`],
      impact: `Avoids under-pricing the resort's own occupancy floor by chasing a transient rate the market isn't currently supporting.`,
      action: `Hold current group rate guidance — do not raise the floor while occupancy is soft.`,
      targetKind: "resort",
      targetId: "group-blocks",
      createdAt: state.t,
      status: "pending",
      payload: {},
    });
  }

  return out;
}
