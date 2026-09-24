import { describe, expect, it } from "vitest";
import { guestExperienceIndex, resortExperienceIndex } from "@/lib/intelligence/guestExperience";
import type { Guest, ServiceRequest } from "@/lib/sim/types";
import { makeState } from "../helpers";

function stubGuest(id: string, roomId: string | null, overrides: Partial<Guest> = {}): Guest {
  return {
    id,
    name: id,
    roomId,
    segment: "leisure-couple",
    loyalty: "none",
    nationality: "IN",
    adults: 2,
    children: 0,
    checkIn: 0,
    checkOut: 100000,
    leadDays: 3,
    channel: "direct",
    spendRoom: 5000,
    spendFnb: 0,
    spendSpa: 0,
    spendOther: 0,
    prefs: [],
    sentiment: 0,
    vip: false,
    stays: 1,
    ...overrides,
  };
}

function stubRequest(id: string, guestId: string, overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id,
    roomId: "room-1",
    guestId,
    type: "housekeeping",
    text: "x",
    createdAt: 0,
    status: "done",
    assignedTo: null,
    slaMin: 30,
    completedAt: 20,
    source: "guest",
    ...overrides,
  };
}

describe("guestExperienceIndex", () => {
  it("maps sentiment -1..1 onto a 0..1 component", () => {
    const { state } = makeState();
    const happy = guestExperienceIndex(stubGuest("g-1", "room-1", { sentiment: 1, checkIn: state.t - 1440 }), state);
    const sad = guestExperienceIndex(stubGuest("g-2", "room-1", { sentiment: -1, checkIn: state.t - 1440 }), state);
    expect(happy.sentimentComponent).toBeCloseTo(1, 5);
    expect(sad.sentimentComponent).toBeCloseTo(0, 5);
  });

  it("defaults SLA component to a neutral 0.75 when the guest has no evaluable requests", () => {
    const { state } = makeState();
    state.requests = {};
    const score = guestExperienceIndex(stubGuest("g-1", "room-1", { checkIn: state.t - 1440 }), state);
    expect(score.slaComponent).toBe(0.75);
    expect(score.requestsTotal).toBe(0);
  });

  it("scores 1 when every evaluable request closed on time, and low when every one breached SLA", () => {
    const { state } = makeState();
    const onTimeGuest = stubGuest("g-on-time", "room-1", { checkIn: state.t - 1440 });
    const lateGuest = stubGuest("g-late", "room-2", { checkIn: state.t - 1440 });
    state.requests = {
      "r-1": stubRequest("r-1", "g-on-time", { createdAt: 0, completedAt: 20, slaMin: 30, status: "done" }),
      "r-2": stubRequest("r-2", "g-late", { createdAt: 0, completedAt: 90, slaMin: 30, status: "done" }),
    };
    state.t = 1440;
    const onTime = guestExperienceIndex(onTimeGuest, state);
    const late = guestExperienceIndex(lateGuest, state);
    expect(onTime.slaComponent).toBe(1);
    expect(late.slaComponent).toBe(0);
  });

  it("holds a luxury guest to a proportionally higher ancillary-spend bar than a leisure-couple guest", () => {
    const { state } = makeState();
    state.requests = {};
    const spendPerNight = 2000;
    const leisure = stubGuest("g-leisure", "room-1", { segment: "leisure-couple", checkIn: state.t - 1440, spendFnb: spendPerNight });
    const luxury = stubGuest("g-luxury", "room-2", { segment: "luxury", checkIn: state.t - 1440, spendFnb: spendPerNight });
    const leisureScore = guestExperienceIndex(leisure, state);
    const luxuryScore = guestExperienceIndex(luxury, state);
    expect(luxuryScore.engagementComponent).toBeLessThan(leisureScore.engagementComponent);
  });

  it("orders loyalty tiers none < silver < gold < platinum", () => {
    const { state } = makeState();
    state.requests = {};
    const tiers = (["none", "silver", "gold", "platinum"] as const).map((loyalty) => guestExperienceIndex(stubGuest(`g-${loyalty}`, "room-1", { loyalty, checkIn: state.t - 1440 }), state).loyaltyComponent);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThan(tiers[i - 1]);
  });

  it("keeps the index within [0,1] and assigns a consistent band", () => {
    const { state } = makeState();
    state.requests = {};
    const score = guestExperienceIndex(stubGuest("g-1", "room-1", { sentiment: 1, loyalty: "platinum", spendFnb: 10000, checkIn: state.t - 1440 }), state);
    expect(score.index).toBeGreaterThanOrEqual(0);
    expect(score.index).toBeLessThanOrEqual(1);
    expect(score.band).toBe("excellent");
  });
});

describe("resortExperienceIndex", () => {
  it("averages only in-house guests and buckets every score into a band", () => {
    const { state } = makeState();
    state.requests = {};
    state.guests = {
      "g-1": stubGuest("g-1", "room-1", { sentiment: 0.9, checkIn: state.t - 1440 }),
      "g-2": stubGuest("g-2", "room-2", { sentiment: -0.9, checkIn: state.t - 1440 }),
      "g-checked-out": stubGuest("g-checked-out", null, { sentiment: 1 }),
    };
    const result = resortExperienceIndex(state);
    expect(result.scores).toHaveLength(2);
    expect(Object.values(result.bandCounts).reduce((a, b) => a + b, 0)).toBe(2);
    expect(result.avgIndex).toBeGreaterThan(0);
    expect(result.avgIndex).toBeLessThan(1);
  });
});
