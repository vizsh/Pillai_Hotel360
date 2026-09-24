import { describe, expect, it } from "vitest";
import { assessGroupBlock, groupBlockRecommendations } from "@/lib/intelligence/groupBlocks";
import type { Guest, SimState } from "@/lib/sim/types";
import { makeState } from "../helpers";

function stubGuest(id: string, roomId: string, segment: Guest["segment"]): Guest {
  return {
    id,
    name: id,
    roomId,
    segment,
    loyalty: "none",
    nationality: "IN",
    adults: 2,
    children: 0,
    checkIn: 0,
    checkOut: 1000,
    leadDays: 3,
    channel: "direct",
    spendRoom: 0,
    spendFnb: 0,
    spendSpa: 0,
    spendOther: 0,
    prefs: [],
    sentiment: 0,
    vip: false,
    stays: 1,
    consentPersonalization: true,
  };
}

/** Occupies every room in the model: the first `groupCount` at `groupRate` tagged "group",
 * the rest at `transientRate` tagged "business" — gives full control over occupancy and
 * the group/transient rate split without depending on the seeded stochastic guest mix. */
function occupyAll(state: SimState, roomIds: string[], groupCount: number, groupRate: number, transientRate: number) {
  state.guests = {};
  roomIds.forEach((roomId, i) => {
    const isGroup = i < groupCount;
    const guestId = `g-${i}`;
    state.guests[guestId] = stubGuest(guestId, roomId, isGroup ? "group" : "business");
    state.rooms[roomId].guestId = guestId;
    state.rooms[roomId].rate = isGroup ? groupRate : transientRate;
  });
}

describe("assessGroupBlock", () => {
  it("computes group/transient ADR split, displacement, and occupancy from current in-house mix", () => {
    const { state, model } = makeState();
    const roomIds = model.rooms.map((r) => r.id);
    occupyAll(state, roomIds, 6, 5000, 8000);

    const a = assessGroupBlock(state, model);
    expect(a.groupRooms).toBe(6);
    expect(a.transientRooms).toBe(roomIds.length - 6);
    expect(a.groupAdr).toBeCloseTo(5000, 5);
    expect(a.transientAdr).toBeCloseTo(8000, 5);
    expect(a.displacementPerRoom).toBeCloseTo(3000, 5);
    expect(a.displacementTotal).toBeCloseTo(3000 * 6, 5);
    expect(a.occupancy).toBeCloseTo(1, 5);
  });

  it("never reports negative displacement when the group segment is priced above transient", () => {
    const { state, model } = makeState();
    const roomIds = model.rooms.map((r) => r.id);
    occupyAll(state, roomIds, 6, 9000, 8000);

    const a = assessGroupBlock(state, model);
    expect(a.displacementPerRoom).toBe(0);
    expect(a.displacementTotal).toBe(0);
  });

  it("returns zeros gracefully when nothing is occupied", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) r.guestId = null;
    const a = assessGroupBlock(state, model);
    expect(a.groupRooms).toBe(0);
    expect(a.groupAdr).toBe(0);
    expect(a.occupancy).toBe(0);
  });
});

describe("groupBlockRecommendations", () => {
  it("does not recommend below the 5-room minimum block size", () => {
    const { state, model } = makeState();
    const roomIds = model.rooms.map((r) => r.id);
    occupyAll(state, roomIds, 3, 5000, 8000);
    const recs = groupBlockRecommendations(state, model);
    expect(recs).toHaveLength(0);
  });

  it("recommends raising the group rate floor at high occupancy with a large displacement gap", () => {
    const { state, model } = makeState();
    const roomIds = model.rooms.map((r) => r.id);
    occupyAll(state, roomIds, 6, 5000, 9000);
    const recs = groupBlockRecommendations(state, model);
    const rec = recs.find((r) => r.id === "rec-group-displacement");
    expect(rec).toBeDefined();
    expect(rec!.confidence).toBeGreaterThan(0);
    expect(rec!.confidence).toBeLessThanOrEqual(0.9);
    expect(recs.find((r) => r.id === "rec-group-protect")).toBeUndefined();
  });

  it("recommends holding rate when a large group share is propping up low occupancy", () => {
    const { state, model } = makeState();
    const roomIds = model.rooms.map((r) => r.id);
    const half = Math.ceil(roomIds.length / 2);
    const occupiedIds = roomIds.slice(0, half);
    for (const r of Object.values(state.rooms)) r.guestId = null;
    occupyAll(state, occupiedIds, Math.ceil(half * 0.5), 5000, 8000);

    const a = assessGroupBlock(state, model);
    expect(a.occupancy).toBeLessThan(0.6);
    expect(a.groupShare).toBeGreaterThan(0.3);

    const recs = groupBlockRecommendations(state, model);
    expect(recs.find((r) => r.id === "rec-group-protect")).toBeDefined();
    expect(recs.find((r) => r.id === "rec-group-displacement")).toBeUndefined();
  });
});
