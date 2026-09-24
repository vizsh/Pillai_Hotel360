import { describe, expect, it } from "vitest";
import { forecastDemand, peakDemandDay } from "@/lib/intelligence/demandSpine";
import { tick } from "@/lib/sim/engine";
import { makeState } from "../helpers";

describe("forecastDemand", () => {
  it("returns a 14-day horizon with occupancy bounds that bracket the expected value", () => {
    const { state, model } = makeState();
    const days = forecastDemand(state, model);
    expect(days).toHaveLength(14);
    for (const d of days) {
      expect(d.occupancyLow).toBeLessThanOrEqual(d.expectedOccupancy + 1e-9);
      expect(d.expectedOccupancy).toBeLessThanOrEqual(d.occupancyHigh + 1e-9);
      expect(d.expectedOccupancy).toBeGreaterThanOrEqual(0);
      expect(d.expectedOccupancy).toBeLessThanOrEqual(1);
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
      expect(d.expectedRevpar).toBeCloseTo(d.expectedAdr * d.expectedOccupancy, 5);
    }
  });

  it("falls back to the scenario baseline with low confidence before any history exists", () => {
    const { state, model } = makeState();
    // seedState backfills kpiHistory with synthetic pre-session data so charts aren't empty
    // on load — clear it to test the genuine cold-start path (a brand new property/session).
    state.kpiHistory = [];
    const days = forecastDemand(state, model);
    for (const d of days) {
      expect(d.source).toBe("scenario-baseline");
      expect(d.confidence).toBeCloseTo(0.3, 5);
    }
  });

  it("shapes cold-start occupancy by day of week (weekend above midweek for the same scenario)", () => {
    const { state, model } = makeState("peak-season");
    state.kpiHistory = [];
    const days = forecastDemand(state, model);
    const byLabel = new Map(days.map((d) => [d.label, d]));
    // Sat is the peak of the weekly curve, Tue/Wed the trough (lib/sim/seed.ts's
    // DAY_OF_WEEK_FACTOR) — every 14-day horizon covers at least one of each.
    const sat = byLabel.get("Sat")!;
    const tue = byLabel.get("Tue")!;
    expect(sat.expectedOccupancy).toBeGreaterThan(tue.expectedOccupancy);
  });

  it("shifts to observed history, with higher confidence, once enough same-weekday samples accumulate", () => {
    const { state, model } = makeState("peak-season", 4);
    // 14 days of hourly ticks accumulates >=2 samples for every weekday bucket.
    for (let i = 0; i < 14 * 24; i++) tick(state, model, 60);
    const days = forecastDemand(state, model);
    const observedDays = days.filter((d) => d.source === "observed");
    expect(observedDays.length).toBeGreaterThan(0);
    for (const d of observedDays) expect(d.confidence).toBeGreaterThan(0.3);
  });
});

describe("peakDemandDay", () => {
  it("returns null for an empty horizon and the max-occupancy day otherwise", () => {
    expect(peakDemandDay([])).toBeNull();
    const { state, model } = makeState("peak-season");
    const days = forecastDemand(state, model);
    const peak = peakDemandDay(days)!;
    for (const d of days) expect(peak.expectedOccupancy).toBeGreaterThanOrEqual(d.expectedOccupancy);
  });
});
