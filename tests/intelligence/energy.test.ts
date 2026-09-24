import { describe, expect, it } from "vitest";
import { assessEnergyWaste, assessSustainability, energyRecommendations } from "@/lib/intelligence/energy";
import { makeState } from "../helpers";

describe("assessEnergyWaste", () => {
  it("flags vacant rooms still conditioned, and drops them once unconditioned", () => {
    const { state, model } = makeState();
    const ids = model.rooms.slice(0, 5).map((r) => r.id);
    for (const id of ids) {
      state.rooms[id].guestId = null;
      state.rooms[id].status = "vacant-clean";
      state.rooms[id].conditioned = true;
      state.rooms[id].energyManaged = false;
    }
    const before = assessEnergyWaste(state, model);
    for (const id of ids) expect(before.candidates.map((r) => r.id)).toContain(id);

    state.rooms[ids[0]].conditioned = false;
    const after = assessEnergyWaste(state, model);
    expect(after.candidates.find((r) => r.id === ids[0])).toBeUndefined();
  });

  it("does not re-flag a room already under energy management", () => {
    const { state, model } = makeState();
    const id = model.rooms[0].id;
    state.rooms[id].guestId = null;
    state.rooms[id].status = "vacant-clean";
    state.rooms[id].conditioned = false;
    state.rooms[id].energyManaged = true;
    const a = assessEnergyWaste(state, model);
    expect(a.candidates.find((r) => r.id === id)).toBeUndefined();
    expect(a.managedCount).toBeGreaterThanOrEqual(1);
  });

  it("flags an occupied room as away only below the presence threshold", () => {
    const { state, model } = makeState("peak-season", 3);
    const room = Object.values(state.rooms).find((r) => r.guestId);
    expect(room).toBeDefined();
    if (!room) return;
    room.conditioned = true;
    room.ecoMode = false;
    room.presence = 0.05;
    const away = assessEnergyWaste(state, model);
    expect(away.awayCandidates.some((r) => r.id === room.id)).toBe(true);

    room.presence = 0.9;
    const present = assessEnergyWaste(state, model);
    expect(present.awayCandidates.some((r) => r.id === room.id)).toBe(false);
  });
});

describe("energyRecommendations", () => {
  it("does not recommend below the 3-room batching threshold", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) if (!r.guestId) r.conditioned = false;
    const ids = model.rooms
      .filter((r) => !state.rooms[r.id].guestId)
      .slice(0, 2)
      .map((r) => r.id);
    for (const id of ids) {
      state.rooms[id].conditioned = true;
      state.rooms[id].energyManaged = false;
    }
    const recs = energyRecommendations(state, model);
    expect(recs.find((r) => r.id === "rec-energy-vacant-conditioning")).toBeUndefined();
  });

  it("recommends once at least 3 vacant rooms are wastefully conditioned, with matching room ids", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) if (!r.guestId) r.conditioned = false;
    const ids = model.rooms
      .filter((r) => !state.rooms[r.id].guestId)
      .slice(0, 4)
      .map((r) => r.id);
    for (const id of ids) {
      state.rooms[id].conditioned = true;
      state.rooms[id].energyManaged = false;
      state.rooms[id].status = "vacant-clean";
    }
    const recs = energyRecommendations(state, model);
    const rec = recs.find((r) => r.id === "rec-energy-vacant-conditioning");
    expect(rec).toBeDefined();
    expect((rec!.payload!.roomIds as string[]).length).toBeGreaterThanOrEqual(4);
    expect(rec!.confidence).toBeGreaterThan(0);
    expect(rec!.confidence).toBeLessThanOrEqual(1);
  });
});

describe("assessSustainability", () => {
  it("scores 100 when there is no identifiable waste to manage", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) {
      r.energyManaged = false;
      r.ecoMode = false;
      if (!r.guestId) r.conditioned = false;
    }
    const s = assessSustainability(state, model);
    expect(s.sustainabilityScore).toBe(100);
  });

  it("reports a lower score when identifiable waste exists but isn't yet managed", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) {
      r.energyManaged = false;
      r.ecoMode = false;
      if (!r.guestId) r.conditioned = false;
    }
    const clean = model.rooms.filter((r) => !state.rooms[r.id].guestId).slice(0, 3);
    for (const r of clean) {
      state.rooms[r.id].conditioned = true;
      state.rooms[r.id].status = "vacant-clean";
    }
    const s = assessSustainability(state, model);
    expect(s.sustainabilityScore).toBeLessThan(100);
    expect(s.sustainabilityScore).toBeGreaterThanOrEqual(0);
  });

  it("derives carbon and carbon-avoided directly from the energy KPIs at a fixed emission factor", () => {
    const { state, model } = makeState();
    state.kpis.energyToday = 100;
    state.kpis.energySavedToday = 20;
    const s = assessSustainability(state, model);
    expect(s.carbonKgToday).toBeCloseTo(71, 5);
    expect(s.carbonAvoidedKgToday).toBeCloseTo(14.2, 5);
  });

  it("scales water estimate with occupied room count, and never goes negative", () => {
    const { state, model } = makeState();
    const occBefore = Object.values(state.rooms).filter((r) => r.guestId).length;
    const before = assessSustainability(state, model);
    expect(before.waterLitersToday).toBeCloseTo(occBefore * 350, 5);
    expect(before.waterLitersToday).toBeGreaterThanOrEqual(0);
  });
});
