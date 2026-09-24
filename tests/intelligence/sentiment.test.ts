import { describe, expect, it } from "vitest";
import { rootCauseLink, scoreText } from "@/lib/intelligence/sentiment";
import type { Review, ServiceRequest } from "@/lib/sim/types";
import { makeState } from "../helpers";

describe("scoreText", () => {
  it("scores clearly positive text above zero", () => {
    const res = scoreText("The room was spotless and the staff were excellent and attentive.");
    expect(res.overall).toBeGreaterThan(0);
  });

  it("scores clearly negative text below zero", () => {
    const res = scoreText("The room was dirty and the shower was cold and dripping.");
    expect(res.overall).toBeLessThan(0);
  });

  it("returns zero for neutral text with no lexicon hits", () => {
    const res = scoreText("We arrived at the property around noon.");
    expect(res.overall).toBe(0);
  });

  it("negation flips a positive word toward negative", () => {
    const plain = scoreText("The staff were good.");
    const negated = scoreText("The staff were not good.");
    expect(negated.overall).toBeLessThan(plain.overall);
  });

  it("stays within [-1, 1] for repeated/emphatic language", () => {
    const res = scoreText("excellent excellent excellent stunning superb fantastic lovely great");
    expect(res.overall).toBeLessThanOrEqual(1);
    expect(res.overall).toBeGreaterThanOrEqual(-1);
  });

  it("routes aspect scores only to aspects whose keywords actually appear", () => {
    const res = scoreText("The room was spotless.");
    expect(Object.keys(res.aspects)).toContain("room");
    expect(Object.keys(res.aspects)).not.toContain("food");
  });
});

function stubRequest(overrides: Partial<ServiceRequest>): ServiceRequest {
  return {
    id: "req-test",
    roomId: "room-1",
    guestId: null,
    type: "maintenance",
    text: "AC not cooling",
    createdAt: 1000,
    status: "done",
    assignedTo: null,
    slaMin: 60,
    completedAt: 1090,
    source: "guest",
    ...overrides,
  };
}

function stubReview(overrides: Partial<Review>): Review {
  return {
    id: "rv-test",
    guestId: "g-test",
    roomId: "room-1",
    text: "The AC in our room was not working the whole stay.",
    rating: 2,
    aspects: { hvac: -0.6 },
    createdAt: 1100,
    source: "post-stay",
    ...overrides,
  };
}

describe("rootCauseLink", () => {
  it("links a negative-aspect review to the matching same-room request and flags an SLA breach", () => {
    const { state } = makeState();
    state.requests = { "req-test": stubRequest({}) };
    const link = rootCauseLink(stubReview({}), state);
    expect(link).not.toBeNull();
    expect(link!.request.id).toBe("req-test");
    expect(link!.aspect).toBe("hvac");
    expect(link!.delayMinutes).toBe(90);
    expect(link!.slaBreached).toBe(true);
  });

  it("does not flag an SLA breach when the request closed inside its SLA", () => {
    const { state } = makeState();
    state.requests = { "req-test": stubRequest({ completedAt: 1030 }) };
    const link = rootCauseLink(stubReview({}), state);
    expect(link!.slaBreached).toBe(false);
  });

  it("returns null when no request exists in the same room", () => {
    const { state } = makeState();
    state.requests = { "req-test": stubRequest({ roomId: "room-2" }) };
    expect(rootCauseLink(stubReview({}), state)).toBeNull();
  });

  it("returns null when the only matching request falls outside the causal window", () => {
    const { state } = makeState();
    state.requests = { "req-test": stubRequest({ createdAt: 1000, completedAt: 1010 }) };
    const farReview = stubReview({ createdAt: 1000 + 4 * 24 * 60 });
    expect(rootCauseLink(farReview, state)).toBeNull();
  });

  it("returns null for aspects with no deterministic request-type mapping, even with a plausible request present", () => {
    const { state } = makeState();
    state.requests = { "req-test": stubRequest({ type: "concierge" }) };
    const noisyReview = stubReview({ aspects: { noise: -0.7 } });
    expect(rootCauseLink(noisyReview, state)).toBeNull();
  });

  it("prefers the most recent matching request when several exist", () => {
    const { state } = makeState();
    state.requests = {
      older: stubRequest({ id: "older", createdAt: 900, completedAt: 950 }),
      newer: stubRequest({ id: "newer", createdAt: 1050, completedAt: 1080 }),
    };
    const link = rootCauseLink(stubReview({}), state);
    expect(link!.request.id).toBe("newer");
  });
});
