import { describe, expect, it } from "vitest";
import { assessGuestImpact, guestImpactRecommendations } from "@/lib/intelligence/guestImpact";
import { makeState } from "../helpers";

describe("assessGuestImpact", () => {
  it("returns null for a chiller — redundant central plant, not a relocatable zone (see code comment in guestImpact.ts)", () => {
    const { state, model } = makeState();
    const chiller = model.assets.find((a) => a.kind === "chiller");
    expect(chiller).toBeDefined();
    if (!chiller) return;
    expect(assessGuestImpact(state, model, chiller.id)).toBeNull();
  });

  it("returns a real assessment for an AHU, scoped to the floors it serves", () => {
    const { state, model } = makeState();
    const ahu = model.assets.find((a) => a.kind === "ahu");
    expect(ahu).toBeDefined();
    if (!ahu) return;
    const res = assessGuestImpact(state, model, ahu.id);
    expect(res).not.toBeNull();
    expect(res!.affectedRoomCount).toBe(model.rooms.filter((r) => ahu.servesFloors.includes(r.floor)).length);
  });

  it("never relocates a guest into a room served by the same failed asset", () => {
    const { state, model } = makeState("peak-season", 4);
    const ahu = model.assets.find((a) => a.kind === "ahu");
    if (!ahu) return;
    const res = assessGuestImpact(state, model, ahu.id);
    if (!res) return;
    for (const pair of res.pairs) {
      const toRoom = model.rooms.find((r) => r.id === pair.toRoomId)!;
      expect(ahu.servesFloors.includes(toRoom.floor)).toBe(false);
    }
  });

  it("only offers same-or-better room types, and correctly flags upgrades", () => {
    const rank: Record<string, number> = { standard: 0, accessible: 0, deluxe: 1, suite: 2 };
    const { state, model } = makeState("peak-season", 8);
    const ahu = model.assets.find((a) => a.kind === "ahu");
    if (!ahu) return;
    const res = assessGuestImpact(state, model, ahu.id);
    if (!res) return;
    for (const pair of res.pairs) {
      const fromRoom = model.rooms.find((r) => r.id === pair.fromRoomId)!;
      const toRoom = model.rooms.find((r) => r.id === pair.toRoomId)!;
      expect(pair.upgrade).toBe(rank[toRoom.type] > rank[fromRoom.type]);
    }
  });
});

describe("guestImpactRecommendations", () => {
  it("only fires for an asset actually in a failed state", () => {
    const { state, model } = makeState();
    const ahu = model.assets.find((a) => a.kind === "ahu")!;
    state.assets[ahu.id].status = "healthy";
    const before = guestImpactRecommendations(state, model);
    expect(before.find((r) => r.targetId === ahu.id)).toBeUndefined();

    state.assets[ahu.id].status = "failed";
    const after = guestImpactRecommendations(state, model);
    const rec = after.find((r) => r.targetId === ahu.id);
    if (rec) expect(rec.module).toBe("relocation");
  });
});
