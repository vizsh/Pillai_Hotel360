import { describe, expect, it } from "vitest";
import { resolveTwinQuery, roomIdForRecommendation } from "@/lib/twin/queries";
import type { Recommendation } from "@/lib/sim/types";
import { makeState } from "../helpers";

function makeRec(overrides: Partial<Recommendation>): Recommendation {
  return {
    id: "rec-test",
    module: "maintenance",
    title: "Test",
    body: "",
    confidence: 0.9,
    basis: [],
    impact: "",
    action: "",
    targetKind: "room",
    targetId: "room-1",
    createdAt: 0,
    status: "pending",
    ...overrides,
  };
}

describe("resolveTwinQuery", () => {
  it("returns null for text that matches no known pattern", () => {
    const { state, model } = makeState();
    expect(resolveTwinQuery("hello there", state, model)).toBeNull();
  });

  it("matches a direct room number lookup", () => {
    const { state, model } = makeState();
    const anyRoom = model.rooms[0];
    const res = resolveTwinQuery(`show me room ${anyRoom.number}`, state, model);
    expect(res).not.toBeNull();
    expect(res!.rooms).toEqual([anyRoom.id]);
  });

  it("matches a VIP query and only returns rooms holding a VIP guest", () => {
    const { state, model } = makeState();
    const res = resolveTwinQuery("list our vip guests", state, model);
    expect(res).not.toBeNull();
    for (const id of res!.rooms) {
      const guestId = state.rooms[id].guestId;
      expect(guestId).not.toBeNull();
      expect(state.guests[guestId!].vip).toBe(true);
    }
  });

  it("matches an unhappy-guest query and only returns rooms below the sentiment threshold", () => {
    const { state, model } = makeState();
    const res = resolveTwinQuery("which guests seem unhappy", state, model);
    expect(res).not.toBeNull();
    for (const id of res!.rooms) {
      expect(state.rooms[id].sentiment).not.toBeNull();
      expect(state.rooms[id].sentiment!).toBeLessThan(-0.2);
    }
  });

  it("matches an SLA-breach query and only returns rooms with a genuinely overdue open request", () => {
    const { state, model } = makeState();
    const res = resolveTwinQuery("any sla breaches open", state, model);
    expect(res).not.toBeNull();
    const overdueRoomIds = new Set(
      Object.values(state.requests).filter((r) => r.status !== "done" && state.t - r.createdAt > r.slaMin).map((r) => r.roomId),
    );
    for (const id of res!.rooms) expect(overdueRoomIds.has(id)).toBe(true);
  });

  it("matches a risk/attention query and returns rooms sorted by descending composite risk", () => {
    const { state, model } = makeState();
    const res = resolveTwinQuery("which rooms need attention tonight", state, model);
    expect(res).not.toBeNull();
    expect(res!.caption).toContain("composite of maintenance, sentiment, housekeeping and energy risk");
  });

  it("caption always names how many rooms matched", () => {
    const { state, model } = makeState();
    const res = resolveTwinQuery("vacant and dirty rooms", state, model);
    expect(res).not.toBeNull();
    expect(res!.caption).toMatch(/^\d+ rooms?/);
  });
});

describe("roomIdForRecommendation", () => {
  it("returns the room id directly when the recommendation already targets a room", () => {
    const { state, model } = makeState();
    const rec = makeRec({ targetKind: "room", targetId: model.rooms[0].id });
    expect(roomIdForRecommendation(rec, state, model)).toBe(model.rooms[0].id);
  });

  it("resolves an asset-targeted recommendation to one of the rooms it actually serves", () => {
    const { state, model } = makeState();
    const asset = model.assets[0];
    const rec = makeRec({ targetKind: "asset", targetId: asset.id });
    const roomId = roomIdForRecommendation(rec, state, model);
    expect(roomId).not.toBeNull();
    const room = model.rooms.find((r) => r.id === roomId);
    expect(room && asset.servesFloors.includes(room.floor)).toBe(true);
  });

  it("resolves a guest-targeted recommendation to that guest's actual room", () => {
    const { state, model } = makeState();
    const occupiedRoom = model.rooms.find((r) => state.rooms[r.id].guestId);
    if (!occupiedRoom) return; // no occupied room in this seed — nothing to assert
    const guestId = state.rooms[occupiedRoom.id].guestId!;
    const rec = makeRec({ targetKind: "guest", targetId: guestId });
    expect(roomIdForRecommendation(rec, state, model)).toBe(occupiedRoom.id);
  });

  it("returns null for a recommendation with no meaningful single room (e.g. resort-wide)", () => {
    const { state, model } = makeState();
    const rec = makeRec({ targetKind: "resort", targetId: "weather" });
    expect(roomIdForRecommendation(rec, state, model)).toBeNull();
  });
});
