import { describe, expect, it } from "vitest";
import { assessGuestRisk, guestRecoveryRecommendations } from "@/lib/intelligence/guestRecovery";
import type { Guest, ServiceRequest } from "@/lib/sim/types";
import { makeState } from "../helpers";

function stubGuest(id: string, roomId: string, overrides: Partial<Guest> = {}): Guest {
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
    checkOut: 2000,
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

function stubRequest(id: string, overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id,
    roomId: "room-1",
    guestId: "g-1",
    type: "housekeeping",
    text: "Towels",
    createdAt: 900,
    status: "open",
    assignedTo: null,
    slaMin: 30,
    completedAt: null,
    source: "guest",
    ...overrides,
  };
}

describe("assessGuestRisk", () => {
  it("flags a guest with breached-SLA requests and negative sentiment, checking out soon", () => {
    const { state, model } = makeState();
    state.guests = {};
    state.requests = {};
    const roomId = model.rooms[0].id;
    state.guests["g-1"] = stubGuest("g-1", roomId, { sentiment: -0.6, checkOut: state.t + 10 * 60 });
    state.requests["r-1"] = stubRequest("r-1", { roomId, guestId: "g-1", createdAt: state.t - 60, slaMin: 30 });

    const risk = assessGuestRisk(state, model);
    expect(risk).toHaveLength(1);
    expect(risk[0].guestId).toBe("g-1");
    expect(risk[0].riskScore).toBeGreaterThanOrEqual(0.5);
    expect(risk[0].delayedRequests).toBe(1);
  });

  it("excludes a guest checking out more than 36h from now even at very negative sentiment", () => {
    const { state, model } = makeState();
    state.guests = {};
    state.requests = {};
    const roomId = model.rooms[0].id;
    state.guests["g-1"] = stubGuest("g-1", roomId, { sentiment: -0.9, checkOut: state.t + 48 * 60 * 60 });
    expect(assessGuestRisk(state, model)).toHaveLength(0);
  });

  it("excludes a guest who has already checked out", () => {
    const { state, model } = makeState();
    state.guests = {};
    const roomId = model.rooms[0].id;
    state.guests["g-1"] = stubGuest("g-1", roomId, { sentiment: -0.9, checkOut: state.t - 10 });
    expect(assessGuestRisk(state, model)).toHaveLength(0);
  });

  it("excludes a guest below the risk threshold (mildly negative sentiment, no delays)", () => {
    const { state, model } = makeState();
    state.guests = {};
    state.requests = {};
    const roomId = model.rooms[0].id;
    state.guests["g-1"] = stubGuest("g-1", roomId, { sentiment: -0.1, checkOut: state.t + 5 * 60 });
    expect(assessGuestRisk(state, model)).toHaveLength(0);
  });

  it("sizes the gesture up for a high-value or VIP guest and down for a lower-value one at the same risk", () => {
    const { state, model } = makeState();
    state.guests = {};
    state.requests = {};
    const rooms = model.rooms.slice(0, 2).map((r) => r.id);
    state.guests["g-hi"] = stubGuest("g-hi", rooms[0], { sentiment: -1, checkOut: state.t + 5 * 60, vip: true });
    state.guests["g-lo"] = stubGuest("g-lo", rooms[1], { sentiment: -0.55, checkOut: state.t + 5 * 60, spendRoom: 0 });
    state.requests["r-hi"] = stubRequest("r-hi", { roomId: rooms[0], guestId: "g-hi", createdAt: state.t - 60, slaMin: 30 });
    state.requests["r-lo"] = stubRequest("r-lo", { roomId: rooms[1], guestId: "g-lo", createdAt: state.t - 60, slaMin: 30 });

    const risk = assessGuestRisk(state, model);
    const hi = risk.find((r) => r.guestId === "g-hi")!;
    const lo = risk.find((r) => r.guestId === "g-lo")!;
    expect(hi.gesture).toContain("late checkout");
    expect(lo.gesture).not.toContain("late checkout");
  });
});

describe("guestRecoveryRecommendations", () => {
  it("caps at 3, sorted by risk descending, with a matching payload", () => {
    const { state, model } = makeState();
    state.guests = {};
    state.requests = {};
    const rooms = model.rooms.slice(0, 5).map((r) => r.id);
    rooms.forEach((roomId, i) => {
      state.guests[`g-${i}`] = stubGuest(`g-${i}`, roomId, { sentiment: -0.5 - i * 0.05, checkOut: state.t + 5 * 60 });
    });

    const recs = guestRecoveryRecommendations(state, model);
    expect(recs.length).toBeLessThanOrEqual(3);
    expect(recs.every((r) => r.module === "recovery")).toBe(true);
    for (let i = 1; i < recs.length; i++) expect((recs[i - 1].payload!.riskScore as number)).toBeGreaterThanOrEqual(recs[i].payload!.riskScore as number);
  });
});
