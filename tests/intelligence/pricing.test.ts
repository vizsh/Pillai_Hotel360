import { describe, expect, it } from "vitest";
import { computePricing } from "@/lib/intelligence/pricing";
import { makeState } from "../helpers";

describe("computePricing", () => {
  it("recommends a multiplier within the grid-search band (0.7–1.6)", () => {
    const { state, model } = makeState("peak-season", 11);
    const res = computePricing(state, model);
    expect(res.recommendedMultiplier).toBeGreaterThanOrEqual(0.7);
    expect(res.recommendedMultiplier).toBeLessThanOrEqual(1.6);
  });

  it("projected RevPAR is never negative and never exceeds projected ADR", () => {
    const { state, model } = makeState("peak-season", 12);
    const res = computePricing(state, model);
    expect(res.projectedRevpar).toBeGreaterThanOrEqual(0);
    expect(res.projectedRevpar).toBeLessThanOrEqual(res.recommendedAdr * 1.01);
  });

  it("the recommended point is the actual RevPAR-maximizing point on its own search curve", () => {
    // The exact regression this guards: computePricing picks `best` inside the same loop
    // that builds `curve`, subject to occ > 0.25 — if a future change decouples those two,
    // the "optimization" stops being one. Recomputing the max independently here would
    // catch that even though every individual number still looks plausible on its own.
    const { state, model } = makeState("peak-season", 13);
    const res = computePricing(state, model);
    const bestOnCurve = Math.max(...res.curve.filter((c) => c.occ > 0.25).map((c) => c.revpar));
    expect(res.projectedRevpar).toBeCloseTo(bestOnCurve, 6);
  });

  it("does not throw and stays bounded across every scenario", () => {
    const scenarios = ["peak-season", "monsoon-lull", "conference-block", "equipment-crisis", "vip-arrival"] as const;
    for (const scenario of scenarios) {
      const { state, model } = makeState(scenario, 20);
      const res = computePricing(state, model);
      expect(Number.isFinite(res.recommendedMultiplier)).toBe(true);
      expect(Number.isFinite(res.projectedRevpar)).toBe(true);
      expect(res.projectedOccupancy).toBeGreaterThanOrEqual(0);
      expect(res.projectedOccupancy).toBeLessThanOrEqual(1);
    }
  });
});
