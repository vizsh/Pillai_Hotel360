import { describe, expect, it } from "vitest";
import { detectCausalChains } from "@/lib/intelligence/causalChain";
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
    consentPersonalization: true,
    ...overrides,
  };
}

function stubRequest(id: string, roomId: string, guestId: string, t: number, overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id,
    roomId,
    guestId,
    type: "maintenance",
    text: "The AC is making a loud rattling noise and not cooling properly.",
    createdAt: t,
    status: "open",
    assignedTo: null,
    slaMin: 30,
    completedAt: null,
    source: "guest",
    ...overrides,
  };
}

function findAhuRoom(model: ReturnType<typeof makeState>["model"]) {
  const asset = model.assets.find((a) => a.kind === "ahu")!;
  const room = model.rooms.find((r) => asset.servesFloors.includes(r.floor))!;
  return { asset, room };
}

describe("detectCausalChains", () => {
  it("returns nothing when there are no recent guest-sourced maintenance requests", () => {
    const { state, model } = makeState();
    state.requests = {};
    expect(detectCausalChains(state, model)).toHaveLength(0);
  });

  it("excludes requests older than the 8h lookback window", () => {
    const { state, model } = makeState();
    const { room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id) };
    state.requests = { "r-1": stubRequest("r-1", room.id, "g-1", state.t - 9 * 60 * 60) };
    expect(detectCausalChains(state, model)).toHaveLength(0);
  });

  it("excludes non-maintenance or system-sourced requests", () => {
    const { state, model } = makeState();
    const { room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id) };
    state.requests = {
      "r-housekeeping": stubRequest("r-housekeeping", room.id, "g-1", state.t, { type: "housekeeping" }),
      "r-system": stubRequest("r-system", room.id, "g-1", state.t, { source: "system" }),
    };
    expect(detectCausalChains(state, model)).toHaveLength(0);
  });

  it("always marks the complaint step done and reflects the guest's request text", () => {
    const { state, model } = makeState();
    const { room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id) };
    state.requests = { "r-1": stubRequest("r-1", room.id, "g-1", state.t) };
    const [chain] = detectCausalChains(state, model);
    const complaint = chain.steps.find((s) => s.stage === "complaint")!;
    expect(complaint.done).toBe(true);
    expect(complaint.label).toContain("rattling");
  });

  it("confirms diagnosis once the serving AHU's failure risk crosses the threshold, not below it", () => {
    const { state, model } = makeState();
    const { asset, room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id) };
    state.requests = { "r-1": stubRequest("r-1", room.id, "g-1", state.t) };

    state.assets[asset.id].failureProb7d = 0.1;
    let diag = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "diagnosis")!;
    expect(diag.done).toBe(false);

    state.assets[asset.id].failureProb7d = 0.45;
    diag = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "diagnosis")!;
    expect(diag.done).toBe(true);
    expect(diag.label).toContain("confirmed");
  });

  it("marks the work-order step done once staff is assigned", () => {
    const { state, model } = makeState();
    const { room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id) };
    state.requests = { "r-1": stubRequest("r-1", room.id, "g-1", state.t) };

    let wo = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "workorder")!;
    expect(wo.done).toBe(false);

    state.requests["r-1"].assignedTo = Object.keys(state.staff)[0];
    wo = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "workorder")!;
    expect(wo.done).toBe(true);
  });

  it("reflects an offered vs. executed relocation recommendation naming this room", () => {
    const { state, model } = makeState();
    const { asset, room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id) };
    state.requests = { "r-1": stubRequest("r-1", room.id, "g-1", state.t) };
    state.recommendations[`rec-relocate-${asset.id}`] = {
      id: `rec-relocate-${asset.id}`,
      module: "relocation",
      title: "t",
      body: "b",
      confidence: 0.8,
      basis: [],
      impact: "i",
      action: "a",
      targetKind: "asset",
      targetId: asset.id,
      createdAt: state.t,
      status: "pending",
      payload: { pairs: [{ fromRoomId: room.id, toRoomId: "room-x" }] },
    };

    let reloc = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "relocation")!;
    expect(reloc.done).toBe(true);
    expect(reloc.label).toContain("not yet applied");

    state.recommendations[`rec-relocate-${asset.id}`].status = "executed";
    reloc = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "relocation")!;
    expect(reloc.label).toBe("Guest relocated");
  });

  it("flags recovery when the guest is independently at-risk, even with no explicit recovery recommendation yet", () => {
    const { state, model } = makeState();
    const { room } = findAhuRoom(model);
    state.guests = { "g-1": stubGuest("g-1", room.id, { sentiment: -1, checkOut: state.t + 5 * 60 }) };
    state.requests = { "r-1": stubRequest("r-1", room.id, "g-1", state.t - 60, { slaMin: 30 }) };

    const recovery = detectCausalChains(state, model)[0].steps.find((s) => s.stage === "recovery")!;
    expect(recovery.done).toBe(true);
    expect(recovery.label).toBe("Guest flagged for recovery");
  });

  it("sorts chains most recent first", () => {
    const { state, model } = makeState();
    const { room } = findAhuRoom(model);
    const otherRoom = model.rooms.find((r) => r.id !== room.id)!;
    state.guests = { "g-1": stubGuest("g-1", room.id), "g-2": stubGuest("g-2", otherRoom.id) };
    state.requests = {
      "r-old": stubRequest("r-old", room.id, "g-1", state.t - 60),
      "r-new": stubRequest("r-new", otherRoom.id, "g-2", state.t - 5),
    };
    const chains = detectCausalChains(state, model);
    expect(chains[0].requestId).toBe("r-new");
  });
});
