import { describe, expect, it } from "vitest";
import { assimilateWetDay } from "@/lib/intelligence/weatherWhatIf";
import { calibrationSummary, newLearnState, observe, posteriorOf, PRIOR_SLOPE } from "@/lib/intelligence/weatherLearner";
import { makeState } from "../helpers";

describe("weather learner (online Bayesian calibration)", () => {
  it("starts at the documented prior and moves toward the data as evidence arrives", () => {
    const s = { wxLearn: newLearnState() };
    expect(posteriorOf(s.wxLearn).mean).toBeCloseTo(PRIOR_SLOPE, 6);
    for (let i = 0; i < 400; i++) observe(s, 0.8, 0.5 * 0.8 + (i % 2 ? 0.02 : -0.02));
    const p = posteriorOf(s.wxLearn);
    expect(p.mean).toBeGreaterThan(0.45);
    expect(p.mean).toBeLessThan(0.55);
    expect(p.sd).toBeLessThan(0.05);
  });

  it("ignores dry ticks", () => {
    const s = { wxLearn: newLearnState() };
    observe(s, 0, 0.3);
    expect(s.wxLearn.n).toBe(0);
  });

  it("recovers the simulator's hidden true sensitivity from assimilated wet-day observations", () => {
    const { state, model } = makeState("peak-season", 4);
    const truth = PRIOR_SLOPE * (state.wxWorldSens ?? 1);
    for (let i = 0; i < 2; i++) assimilateWetDay(state, model);
    const c = calibrationSummary(state);
    expect(c.learned.n).toBeGreaterThan(100);
    expect(Math.abs(c.learned.mean - truth)).toBeLessThan(Math.abs(PRIOR_SLOPE - truth) + 0.02);
    expect(Math.abs(c.learned.mean - truth)).toBeLessThan(0.06);
    expect(c.maeLearned).not.toBeNull();
    expect(c.maeLearned!).toBeLessThanOrEqual(c.maePrior! * 1.02);
  }, 30000);
});
