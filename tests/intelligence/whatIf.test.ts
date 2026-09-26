import { describe, expect, it } from "vitest";
import { runWhatIf } from "@/lib/intelligence/whatIf";
import { computePricing } from "@/lib/intelligence/pricing";
import { solveRoster } from "@/lib/intelligence/staffing";
import { makeState } from "../helpers";

describe("runWhatIf", () => {
  it("never mutates the real state it's given", () => {
    const { state, model } = makeState();
    const before = state.kpis.occupancy;
    runWhatIf(state, model, 0.98);
    expect(state.kpis.occupancy).toBe(before);
  });

  it("reports the real current occupancy as 'before' and the requested one as 'after'", () => {
    const { state, model } = makeState();
    const res = runWhatIf(state, model, 0.95);
    expect(res.occupancyBefore).toBe(state.kpis.occupancy);
    expect(res.occupancyAfter).toBe(0.95);
  });

  it("projects higher RevPAR at a higher hypothetical occupancy than at a lower one, all else equal", () => {
    const { state, model } = makeState();
    const low = runWhatIf(state, model, 0.3);
    const high = runWhatIf(state, model, 0.95);
    expect(high.pricing.revparAfter).toBeGreaterThan(low.pricing.revparAfter);
  });

  it("staffing.unmetAfter matches solveRoster called directly against the same hypothetical occupancy", () => {
    const { state, model } = makeState();
    const res = runWhatIf(state, model, 0.9);
    const direct = solveRoster({ ...state, kpis: { ...state.kpis, occupancy: 0.9 } }, model);
    expect(res.staffing.unmetAfter).toBe(direct.unmet);
  });

  it("pricing.adrBefore matches computePricing's own currentAdr for the real, unmodified state", () => {
    const { state, model } = makeState();
    const res = runWhatIf(state, model, 0.5);
    const direct = computePricing(state, model);
    expect(res.pricing.adrBefore).toBe(direct.currentAdr);
  });

  it("a near-empty hypothetical occupancy never projects a negative inventory reorder quantity", () => {
    const { state, model } = makeState();
    const res = runWhatIf(state, model, 0.05);
    expect(res.inventory.reorderQtyAfter).toBeGreaterThanOrEqual(0);
  });
});
