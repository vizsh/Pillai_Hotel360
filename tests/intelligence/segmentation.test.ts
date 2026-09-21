import { describe, expect, it } from "vitest";
import { guestVector, kmeans, segmentElasticity, segmentGuests } from "@/lib/intelligence/segmentation";
import { makeState } from "../helpers";

describe("guestVector", () => {
  it("always returns a 6-dimensional feature vector with no NaN/Infinity", () => {
    const { state } = makeState("peak-season", 99);
    for (const g of Object.values(state.guests)) {
      const v = guestVector(g);
      expect(v).toHaveLength(6);
      for (const x of v) expect(Number.isFinite(x)).toBe(true);
    }
  });
});

describe("kmeans", () => {
  it("assigns every point to exactly one of k clusters", () => {
    const vecs = Array.from({ length: 30 }, (_, i) => [i % 5, (i * 3) % 7]);
    const { assign, centroids } = kmeans(vecs, 5, 1);
    expect(centroids).toHaveLength(5);
    expect(assign).toHaveLength(vecs.length);
    for (const a of assign) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(5);
    }
  });

  it("is deterministic for a given seed", () => {
    const vecs = Array.from({ length: 20 }, (_, i) => [Math.sin(i), Math.cos(i)]);
    const a = kmeans(vecs, 3, 7);
    const b = kmeans(vecs, 3, 7);
    expect(a.assign).toEqual(b.assign);
  });
});

describe("segmentGuests", () => {
  it("returns no clusters below the 5-guest minimum documented in pricing.ts", () => {
    const { state, model } = makeState();
    state.guests = {};
    expect(segmentGuests(state, model)).toEqual([]);
  });

  it("every cluster's elasticity matches a known, named segment", () => {
    const { state, model } = makeState("peak-season", 5);
    const clusters = segmentGuests(state, model);
    expect(clusters.length).toBeGreaterThan(0); // peak-season is high-occupancy — should always clear the 5-guest floor
    for (const c of clusters) {
      expect(Object.values(segmentElasticity)).toContain(c.elasticity);
    }
  });

  it("cluster member counts sum to the in-house guest population", () => {
    const { state, model } = makeState("peak-season", 6);
    const clusters = segmentGuests(state, model);
    const inHouse = Object.values(state.guests).filter((g) => g.roomId).length;
    const total = clusters.reduce((s, c) => s + c.size, 0);
    expect(total).toBe(inHouse);
  });
});
