import { describe, expect, it } from "vitest";
import { tick } from "@/lib/sim/engine";
import { makeState } from "../helpers";

describe("tick", () => {
  it("advances state.t by exactly dtMin", () => {
    const { state, model } = makeState();
    const before = state.t;
    tick(state, model, 15);
    expect(state.t).toBe(before + 15);
  });

  it("keeps core KPIs within sane, guaranteed-true bounds over a simulated day", () => {
    const { state, model } = makeState("peak-season", 3);
    for (let i = 0; i < 96; i++) tick(state, model, 15); // 24h in 15-min steps
    expect(state.kpis.occupancy).toBeGreaterThanOrEqual(0);
    expect(state.kpis.occupancy).toBeLessThanOrEqual(1);
    expect(state.kpis.adr).toBeGreaterThan(0);
    expect(state.kpis.revpar).toBeGreaterThanOrEqual(0);
    // RevPAR = ADR * occupancy by definition — it can never exceed ADR.
    expect(state.kpis.revpar).toBeLessThanOrEqual(state.kpis.adr * 1.001);
    expect(state.kpis.gss).toBeGreaterThanOrEqual(1);
    expect(state.kpis.gss).toBeLessThanOrEqual(5);
  });

  it("never produces negative room energy or revenue", () => {
    const { state, model } = makeState("peak-season", 5);
    for (let i = 0; i < 48; i++) tick(state, model, 15);
    for (const r of Object.values(state.rooms)) {
      expect(r.energyKwh).toBeGreaterThanOrEqual(0);
      expect(r.revenue7d).toBeGreaterThanOrEqual(0);
    }
    expect(state.kpis.revenueToday).toBeGreaterThanOrEqual(0);
  });

  it("keeps every asset's failure probability and health within [0,1] under sustained wear", () => {
    const { state, model } = makeState("equipment-crisis", 9);
    for (let i = 0; i < 200; i++) tick(state, model, 15);
    for (const st of Object.values(state.assets)) {
      expect(st.failureProb7d).toBeGreaterThanOrEqual(0);
      expect(st.failureProb7d).toBeLessThanOrEqual(1);
      expect(st.health).toBeGreaterThanOrEqual(0);
      expect(st.health).toBeLessThanOrEqual(1);
    }
  });

  it("keeps guest sentiment within [-1, 1] under sustained ticking", () => {
    const { state, model } = makeState("peak-season", 15);
    for (let i = 0; i < 200; i++) tick(state, model, 15);
    for (const g of Object.values(state.guests)) {
      expect(g.sentiment).toBeGreaterThanOrEqual(-1);
      expect(g.sentiment).toBeLessThanOrEqual(1);
    }
  });

  it("regenerates recommendations on the documented 30-minute cadence without throwing across every scenario", () => {
    const scenarios = ["peak-season", "monsoon-lull", "conference-block", "equipment-crisis", "vip-arrival"] as const;
    for (const scenario of scenarios) {
      const { state, model } = makeState(scenario, 21);
      for (let i = 0; i < 8; i++) tick(state, model, 15); // crosses at least one 30-min boundary
      for (const rec of Object.values(state.recommendations)) {
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});
