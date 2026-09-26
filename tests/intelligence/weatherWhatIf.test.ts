import { describe, expect, it } from "vitest";
import { runWeatherWhatIf } from "@/lib/intelligence/weatherWhatIf";
import { makeState } from "../helpers";

describe("runWeatherWhatIf", () => {
  it("never mutates the real state it's given", () => {
    const { state, model } = makeState();
    const before = JSON.stringify(state);
    runWeatherWhatIf(state, model, { condition: "rain", tempC: 24, rainProbability: 0.9 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("a heavy-rain scenario raises F&B demand relative to a clear baseline, on average (median delta >= 0)", () => {
    const { state, model } = makeState();
    const res = runWeatherWhatIf(state, model, { condition: "rain", tempC: 24, rainProbability: 0.95 });
    expect(res.fnbDemandDelta.p50).toBeGreaterThanOrEqual(0);
  });

  it("a severe heatwave raises HVAC (chiller/AHU) failure risk relative to a clear baseline, on average", () => {
    const { state, model } = makeState();
    const res = runWeatherWhatIf(state, model, { condition: "heatwave", tempC: 39, rainProbability: 0.02 });
    expect(res.hvacRiskDelta.p50).toBeGreaterThanOrEqual(0);
  });

  it("a clear-vs-clear scenario never touches occupancy (weather has no check-in-rate mechanism)", () => {
    const { state, model } = makeState();
    const res = runWeatherWhatIf(state, model, { condition: "clear", tempC: 27, rainProbability: 0.1 });
    expect(Math.abs(res.occupancyDelta.p50)).toBeLessThan(0.001);
  });

  it("rain's F&B demand effect is clearly larger than the random noise floor a clear-vs-clear run shows", () => {
    // Independent-sample Monte Carlo (see the seeding comment in weatherWhatIf.ts) means two
    // otherwise-identical clear-weather runs still differ by chance — per-guest random spend
    // draws alone can separate them by a lot. So the real correctness bar isn't "clear vs clear
    // is exactly zero," it's "rain's effect size clearly exceeds that baseline noise."
    const { state, model } = makeState();
    const noise = runWeatherWhatIf(state, model, { condition: "clear", tempC: 27, rainProbability: 0.1 });
    const rain = runWeatherWhatIf(state, model, { condition: "rain", tempC: 24, rainProbability: 0.95 });
    expect(rain.fnbDemandDelta.p50).toBeGreaterThan(Math.abs(noise.fnbDemandDelta.p50) * 1.5);
  });

  it("returns a percentile band (p10 <= p50 <= p90) for every metric", () => {
    const { state, model } = makeState();
    const res = runWeatherWhatIf(state, model, { condition: "rain", tempC: 24, rainProbability: 0.8 });
    for (const m of [res.occupancyDelta, res.fnbDemandDelta, res.energyDelta, res.staffingUnmetDelta, res.hvacRiskDelta, res.openFnbConciergeRequestsDelta]) {
      expect(m.p10).toBeLessThanOrEqual(m.p50);
      expect(m.p50).toBeLessThanOrEqual(m.p90);
    }
  });
});
