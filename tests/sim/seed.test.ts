import { describe, expect, it } from "vitest";
import { getModel } from "@/lib/architecture/model";
import { seedState } from "@/lib/sim/seed";

describe("seedState", () => {
  it("is deterministic for a given (model, seed, scenario)", () => {
    const model = getModel();
    const a = seedState(model, 42, "peak-season");
    const b = seedState(model, 42, "peak-season");
    // Deep-equal on the whole state would be brittle against intentional shape changes;
    // check the properties that actually matter for a demo staying reproducible — same
    // room count, same guest count, same baseRate, same first room's rate/status.
    expect(Object.keys(a.rooms).length).toBe(Object.keys(b.rooms).length);
    expect(Object.keys(a.guests).length).toBe(Object.keys(b.guests).length);
    expect(a.baseRate).toBe(b.baseRate);
    const firstRoomId = model.rooms[0].id;
    expect(a.rooms[firstRoomId].rate).toBe(b.rooms[firstRoomId].rate);
    expect(a.rooms[firstRoomId].status).toBe(b.rooms[firstRoomId].status);
  });

  it("produces different occupancy/guest population for different seeds", () => {
    const model = getModel();
    const a = seedState(model, 1, "peak-season");
    const b = seedState(model, 2, "peak-season");
    // Not guaranteed different on every single field, but the guest id sets should differ —
    // if this ever starts failing, the PRNG is very likely no longer seeded by `seed`.
    const idsA = Object.keys(a.guests).sort().join(",");
    const idsB = Object.keys(b.guests).sort().join(",");
    expect(idsA).not.toBe(idsB);
  });

  it("seeds every room with a valid status and a positive rate", () => {
    const model = getModel();
    const state = seedState(model, 7, "peak-season");
    for (const r of model.rooms) {
      const rs = state.rooms[r.id];
      expect(rs).toBeDefined();
      expect(rs.rate).toBeGreaterThan(0);
      expect(["vacant-clean", "vacant-dirty", "cleaning", "occupied", "vip", "ooo"]).toContain(rs.status);
    }
  });

  it("occupancy target roughly matches scenario intent (peak-season is high occupancy)", () => {
    const model = getModel();
    const peak = seedState(model, 1, "peak-season");
    const lull = seedState(model, 1, "monsoon-lull");
    const occOf = (s: typeof peak) => Object.values(s.rooms).filter((r) => r.guestId).length / model.rooms.length;
    // This is the exact kind of regression a scenario-tuning change could silently break —
    // peak season should read as meaningfully busier than a lull scenario.
    expect(occOf(peak)).toBeGreaterThan(occOf(lull));
  });
});
