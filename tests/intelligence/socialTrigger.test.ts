import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetSocialHistory,
  recordDisruptionSample,
  socialTriggerState,
  setSignalAnalysis,
  setSocialSignals,
  publicConcernScore,
  setGuestWeatherComplaintSignal,
} from "@/lib/intelligence/socialSignals";
import { socialTriggerRecommendations } from "@/lib/intelligence/socialTrigger";
import { makeState } from "../helpers";

function analysisWith(urgency: number, n = 3) {
  const byId: Record<string, import("@/lib/ai/signalIntel").SignalAnalysis> = {};
  for (let i = 0; i < n; i++) byId[`p${i}`] = { intent: "safety-warning", urgency, location: "Goa", summary: `post ${i}`, by: "rules" };
  return byId;
}

describe("social signal as a trigger (burst + corroboration gate)", () => {
  beforeEach(() => {
    resetSocialHistory();
    setSocialSignals(null);
    setSignalAnalysis(null);
    setGuestWeatherComplaintSignal(0);
  });
  afterEach(() => {
    resetSocialHistory();
    setSocialSignals(null);
    setSignalAnalysis(null);
    setGuestWeatherComplaintSignal(0);
  });

  it("never fires on a single sample, even a severe one", () => {
    setSocialSignals({ items: [], hazards: [{ id: "h1", name: "TC Test", eventType: "TC", alertLevel: "Orange", lat: 15, lon: 74, url: "x", fromDate: "", provider: "gdacs" }], trendScore: null, sources: {} });
    setSignalAnalysis({ analysis: analysisWith(0.9), provider: "rules", model: "" });
    recordDisruptionSample();
    expect(socialTriggerState().triggered).toBe(false);
  });

  it("requires the score to have actually risen versus its own recent baseline", () => {
    setSocialSignals(null);
    setSignalAnalysis(null);
    for (let i = 0; i < 4; i++) recordDisruptionSample(); // flat, low baseline
    setSocialSignals({ items: [], hazards: [{ id: "h1", name: "TC", eventType: "TC", alertLevel: "Orange", lat: 15, lon: 74, url: "x", fromDate: "", provider: "gdacs" }], trendScore: null, sources: {} });
    setSignalAnalysis({ analysis: analysisWith(0.85, 4), provider: "rules", model: "" });
    recordDisruptionSample();
    const t = socialTriggerState();
    expect(t.burstRate).toBeGreaterThan(0.1);
    expect(t.corroboratingProviders).toBeGreaterThanOrEqual(1);
    expect(t.triggered).toBe(true);
  });

  it("does not fire on a burst with zero independent official corroboration", () => {
    for (let i = 0; i < 4; i++) recordDisruptionSample();
    setSocialSignals({ items: [], hazards: [], trendScore: null, sources: {} });
    setSignalAnalysis({ analysis: analysisWith(0.9, 4), provider: "rules", model: "" });
    recordDisruptionSample();
    expect(socialTriggerState().corroboratingProviders).toBe(0);
    expect(socialTriggerState().triggered).toBe(false);
  });

  it("counts GDACS and EONET as two independent providers", () => {
    setSocialSignals({
      items: [],
      hazards: [
        { id: "g1", name: "TC", eventType: "TC", alertLevel: "Orange", lat: 15, lon: 74, url: "x", fromDate: "", provider: "gdacs" },
        { id: "e1", name: "Storm", eventType: "Severe Storms", alertLevel: "Orange", lat: 15.1, lon: 74.1, url: "y", fromDate: "", provider: "eonet" },
      ],
      trendScore: null,
      sources: {},
    });
    for (let i = 0; i < 4; i++) recordDisruptionSample();
    setSignalAnalysis({ analysis: analysisWith(0.85, 4), provider: "rules", model: "" });
    recordDisruptionSample();
    expect(socialTriggerState().corroboratingProviders).toBe(2);
  });

  it("raises a real recommendation, with a derived what-if scenario in its payload, once triggered", () => {
    const { state, model } = makeState();
    setSocialSignals({ items: [], hazards: [{ id: "h1", name: "Cyclone approaching", eventType: "TC", alertLevel: "Orange", lat: 15, lon: 74, url: "x", fromDate: "", provider: "gdacs" }], trendScore: null, sources: {} });
    for (let i = 0; i < 4; i++) recordDisruptionSample();
    setSignalAnalysis({ analysis: analysisWith(0.9, 4), provider: "rules", model: "" });
    recordDisruptionSample();
    const recs = socialTriggerRecommendations(state, model);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("rec-social-trigger");
    expect(recs[0].payload?.scenario).toBeDefined();
    expect(recs[0].basis.some((b) => b.includes("burst"))).toBe(true);
  });

  it("guest-reported weather complaints feed back into the same concern score", () => {
    setSocialSignals(null);
    setGuestWeatherComplaintSignal(0);
    const before = publicConcernScore();
    setGuestWeatherComplaintSignal(4);
    const after = publicConcernScore();
    expect(after).toBeGreaterThan(before);
  });
});
