import { describe, expect, it } from "vitest";
import { nextBestActions } from "@/lib/intelligence/personalization";
import { applyNextBestAction } from "@/lib/sim/actions";
import { makeState } from "../helpers";

describe("nextBestActions", () => {
  it("never returns a negative revenueUplift, and only tags a spend category when there is spend", () => {
    const { state, model } = makeState("peak-season", 5);
    for (const g of Object.values(state.guests)) {
      for (const a of nextBestActions(g, state, model)) {
        expect(a.revenueUplift).toBeGreaterThanOrEqual(0);
        if (a.revenueUplift === 0) expect(a.spendCategory).toBe("none");
        else expect(["fnb", "spa", "other"]).toContain(a.spendCategory);
      }
    }
  });

  it("never targets a preference/segment-driven upsell at a guest who opted out of personalization", () => {
    const { state, model } = makeState("peak-season", 5);
    const preferenceDrivenIds = new Set(["spa", "upgrade", "vip-welcome", "kids", "dinner", "rebook", "late-co", "transfer", "workspace"]);
    for (const g of Object.values(state.guests)) {
      if (g.consentPersonalization) continue;
      for (const a of nextBestActions(g, state, model)) {
        expect(preferenceDrivenIds.has(a.id)).toBe(false);
      }
    }
  });

  it("still offers service recovery to an opted-out guest with negative sentiment", () => {
    const { state, model } = makeState();
    const g = Object.values(state.guests).find((x) => x.roomId)!;
    g.consentPersonalization = false;
    g.sentiment = -0.5;
    const actions = nextBestActions(g, state, model);
    expect(actions.some((a) => a.id === "recovery")).toBe(true);
  });

  it("falls back to a generic courtesy call, never a targeted offer, for an opted-out guest with no service issue", () => {
    const { state, model } = makeState();
    const g = Object.values(state.guests).find((x) => x.roomId)!;
    g.consentPersonalization = false;
    g.sentiment = 0.5;
    g.prefs = ["spa", "sea-view"];
    const actions = nextBestActions(g, state, model);
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("check");
  });
});

describe("applyNextBestAction", () => {
  it("applies sentiment uplift and, for a real upsell, increments the matching spend field and the ancillary-revenue KPI", () => {
    const { state, model } = makeState("peak-season", 3);
    const guestId = Object.values(state.guests).find((g) => g.roomId)!.id;
    const g = state.guests[guestId];
    const before = { sentiment: g.sentiment, spendSpa: g.spendSpa, ancillary: state.kpis.ancillaryRevenueToday };

    applyNextBestAction(state, model, guestId, {
      id: "spa",
      label: "Offer 20% spa credit for tomorrow morning",
      score: 0.8,
      reason: "test",
      cost: 600,
      uplift: 0.22,
      revenueUplift: 1800,
      spendCategory: "spa",
    });

    expect(g.sentiment).toBeCloseTo(Math.min(1, before.sentiment + 0.22), 5);
    expect(g.spendSpa).toBe(before.spendSpa + 1800);
    expect(state.kpis.ancillaryRevenueToday).toBe(before.ancillary + 1800);
  });

  it("does not touch spend or the KPI for a zero-revenue action (service recovery, VIP welcome, etc.)", () => {
    const { state, model } = makeState("peak-season", 4);
    const guestId = Object.values(state.guests).find((g) => g.roomId)!.id;
    const g = state.guests[guestId];
    const before = { spendFnb: g.spendFnb, spendSpa: g.spendSpa, spendOther: g.spendOther, ancillary: state.kpis.ancillaryRevenueToday };

    applyNextBestAction(state, model, guestId, {
      id: "vip-welcome",
      label: "VIP welcome: champagne + GM note",
      score: 0.85,
      reason: "test",
      cost: 2200,
      uplift: 0.2,
      revenueUplift: 0,
      spendCategory: "none",
    });

    expect(g.spendFnb).toBe(before.spendFnb);
    expect(g.spendSpa).toBe(before.spendSpa);
    expect(g.spendOther).toBe(before.spendOther);
    expect(state.kpis.ancillaryRevenueToday).toBe(before.ancillary);
  });

  it("is a no-op, not a crash, when the guest id doesn't exist in state", () => {
    const { state, model } = makeState();
    expect(() =>
      applyNextBestAction(state, model, "guest-does-not-exist", {
        id: "check",
        label: "x",
        score: 0.3,
        reason: "",
        cost: 0,
        uplift: 0.05,
        revenueUplift: 0,
        spendCategory: "none",
      }),
    ).not.toThrow();
  });
});
