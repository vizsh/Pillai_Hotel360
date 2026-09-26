import { describe, expect, it } from "vitest";
import { resolveTwinQuery } from "@/lib/twin/queries";
import { makeState } from "../helpers";

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
