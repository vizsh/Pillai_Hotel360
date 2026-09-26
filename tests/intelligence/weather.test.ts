import { afterEach, describe, expect, it } from "vitest";
import { forecastWeather, setLiveWeather, weatherForDay, weatherRecommendations, weatherSource } from "@/lib/intelligence/weather";
import { DAY } from "@/lib/sim/seed";
import { makeState } from "../helpers";

afterEach(() => setLiveWeather(null));

describe("the live-weather adapter seam", () => {
  it("reports 'simulated' when no live data has ever been set", () => {
    expect(weatherSource()).toBe("simulated");
  });

  it("reports 'live' and returns the real days once set, without needing any state/model", () => {
    setLiveWeather([
      { dayOffset: 0, tempC: 31, rainProbability: 0.1 },
      { dayOffset: 1, tempC: 36, rainProbability: 0.05 },
      { dayOffset: 2, tempC: 25, rainProbability: 0.8 },
    ]);
    expect(weatherSource()).toBe("live");
    const { state } = makeState();
    const days = forecastWeather(state);
    expect(days[0]).toMatchObject({ dayOffset: 0, tempC: 31, condition: "clear" });
    expect(days[1]).toMatchObject({ dayOffset: 1, tempC: 36, condition: "heatwave" });
    expect(days[2]).toMatchObject({ dayOffset: 2, tempC: 25, condition: "rain" });
  });

  it("falls back to the deterministic simulated forecast once live data is cleared", () => {
    setLiveWeather([{ dayOffset: 0, tempC: 40, rainProbability: 0 }]);
    expect(weatherSource()).toBe("live");
    setLiveWeather(null);
    expect(weatherSource()).toBe("simulated");
  });
});

describe("weatherForDay", () => {
  it("is deterministic for the same seed, day index and scenario", () => {
    const a = weatherForDay(7, 42, "peak-season");
    const b = weatherForDay(7, 42, "peak-season");
    expect(a).toEqual(b);
  });

  it("varies across day indices for the same seed", () => {
    const days = Array.from({ length: 30 }, (_, i) => weatherForDay(7, i, "peak-season").condition);
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it("produces meaningfully more rain days for monsoon-lull than peak-season over a large sample", () => {
    const n = 200;
    const monsoonRainDays = Array.from({ length: n }, (_, i) => weatherForDay(3, i, "monsoon-lull").condition === "rain").filter(Boolean).length;
    const peakRainDays = Array.from({ length: n }, (_, i) => weatherForDay(3, i, "peak-season").condition === "rain").filter(Boolean).length;
    expect(monsoonRainDays).toBeGreaterThan(peakRainDays);
  });

  it("keeps rainProbability within [0,1] and temperature in a plausible range", () => {
    for (let i = 0; i < 50; i++) {
      const d = weatherForDay(11, i, "peak-season");
      expect(d.rainProbability).toBeGreaterThanOrEqual(0);
      expect(d.rainProbability).toBeLessThanOrEqual(1);
      expect(d.tempC).toBeGreaterThan(15);
      expect(d.tempC).toBeLessThan(45);
    }
  });
});

describe("forecastWeather", () => {
  it("returns a 7-day horizon with sequential day offsets starting today", () => {
    const { state } = makeState();
    const days = forecastWeather(state);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.dayOffset)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("agrees with weatherForDay for the same starting day", () => {
    const { state } = makeState("peak-season", 3);
    const days = forecastWeather(state);
    const startDay = Math.floor(state.t / DAY);
    expect(days[0].condition).toBe(weatherForDay(state.seed, startDay, state.scenario).condition);
  });
});

describe("weatherRecommendations", () => {
  it("returns nothing below the occupancy gate even on a rain/heatwave day", () => {
    const { state, model } = makeState();
    for (const r of Object.values(state.rooms)) r.guestId = null;
    state.kpis.occupancy = 0.1;
    expect(weatherRecommendations(state, model)).toHaveLength(0);
  });

  it("recommends a rain playbook when rain falls within the next 2 days and occupancy is meaningful", () => {
    const { state, model } = makeState("peak-season", 3);
    state.kpis.occupancy = 0.8;
    // Find a day offset (0 or 1) that's a rain day for this seed/scenario at some start time,
    // then align state.t to that day so forecastWeather sees it within the 2-day gate.
    let found = -1;
    let dayIndex = -1;
    for (let d = 0; d < 60; d++) {
      const w = weatherForDay(state.seed, d, state.scenario);
      if (w.condition === "rain") {
        dayIndex = d;
        found = 0;
        break;
      }
    }
    expect(found).toBe(0);
    state.t = dayIndex * DAY + 10 * 60;
    const recs = weatherRecommendations(state, model);
    expect(recs.some((r) => r.id === "rec-weather-rain")).toBe(true);
  });

  it("recommends a heatwave playbook tied to the AC/chiller wear rate when a heatwave falls in the window", () => {
    const { state, model } = makeState("peak-season", 3);
    state.kpis.occupancy = 0.8;
    let dayIndex = -1;
    for (let d = 0; d < 200; d++) {
      if (weatherForDay(state.seed, d, state.scenario).condition === "heatwave") {
        dayIndex = d;
        break;
      }
    }
    expect(dayIndex).toBeGreaterThanOrEqual(0);
    state.t = dayIndex * DAY + 10 * 60;
    const recs = weatherRecommendations(state, model);
    expect(recs.some((r) => r.id === "rec-weather-heatwave")).toBe(true);
  });
});
