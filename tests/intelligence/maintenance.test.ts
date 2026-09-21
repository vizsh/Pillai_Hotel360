import { describe, expect, it } from "vitest";
import { assessAsset, statusFor } from "@/lib/intelligence/maintenance";
import type { AssetState } from "@/lib/sim/types";
import { makeState } from "../helpers";

function fixture(overrides: Partial<AssetState>): AssetState {
  return {
    id: "test-asset",
    runtimeHours: 0,
    temp: 20,
    tempBase: 20,
    vibration: 1,
    vibBase: 1,
    current: 100,
    health: 1,
    failureProb7d: 0,
    rulDays: 999,
    status: "healthy",
    lastServiceAt: 0,
    history: [],
    ...overrides,
  };
}

describe("assessAsset", () => {
  it("gives a freshly serviced, healthy asset a low failure probability", () => {
    const { model } = makeState();
    const asset = model.assets[0];
    const res = assessAsset(asset.kind, fixture({}));
    expect(res.prob7d).toBeLessThan(0.1);
  });

  it("gives a heavily worn, anomalous asset a high failure probability", () => {
    const { model } = makeState();
    const asset = model.assets[0];
    const worn = fixture({ runtimeHours: 40000, health: 0.15, temp: 40, tempBase: 20, vibration: 3, vibBase: 1 });
    const res = assessAsset(asset.kind, worn);
    expect(res.prob7d).toBeGreaterThan(0.5);
  });

  it("keeps prob7d in [0,1] and rulDays non-negative for every real asset in the seeded model", () => {
    const { state, model } = makeState();
    for (const a of model.assets) {
      const st = state.assets[a.id];
      const res = assessAsset(a.kind, st);
      expect(res.prob7d).toBeGreaterThanOrEqual(0);
      expect(res.prob7d).toBeLessThanOrEqual(1);
      expect(res.rulDays).toBeGreaterThanOrEqual(0);
    }
  });

  it("higher runtime hours never decreases failure probability, all else equal", () => {
    const { model } = makeState();
    const kind = model.assets[0].kind;
    const early = assessAsset(kind, fixture({ runtimeHours: 1000 }));
    const late = assessAsset(kind, fixture({ runtimeHours: 20000 }));
    expect(late.prob7d).toBeGreaterThanOrEqual(early.prob7d);
  });
});

describe("statusFor", () => {
  it("never overrides a failed or in-service asset regardless of the computed probability", () => {
    expect(statusFor(0.01, fixture({ status: "failed" }))).toBe("failed");
    expect(statusFor(0.9, fixture({ status: "service" }))).toBe("service");
  });

  it("maps probability into the documented healthy/degraded/critical bands", () => {
    expect(statusFor(0.1, fixture({ status: "healthy" }))).toBe("healthy");
    expect(statusFor(0.4, fixture({ status: "healthy" }))).toBe("degraded");
    expect(statusFor(0.7, fixture({ status: "healthy" }))).toBe("critical");
  });
});
