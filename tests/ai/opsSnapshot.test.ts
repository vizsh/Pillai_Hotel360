import { describe, expect, it } from "vitest";
import { buildOpsSnapshot } from "@/lib/ai/opsSnapshot";
import { makeState } from "../helpers";

describe("buildOpsSnapshot", () => {
  it("includes one entry per model room and per in-house guest", () => {
    const { state, model } = makeState();
    const snapshot = buildOpsSnapshot(state, model, "gm");
    expect(snapshot.rooms).toHaveLength(model.rooms.length);
    const inHouseGuests = Object.values(state.guests).filter((g) => g.roomId).length;
    expect(snapshot.guests).toHaveLength(inHouseGuests);
  });

  it("reveals guest spend for gm (canViewGuestValue)", () => {
    const { state, model } = makeState();
    const g = Object.values(state.guests).find((x) => x.roomId)!;
    g.consentPersonalization = true;
    const snapshot = buildOpsSnapshot(state, model, "gm");
    const entry = snapshot.guests.find((x) => x.id === g.id)!;
    expect(entry.totalSpend).not.toBeNull();
  });

  it("masks guest spend for a role without canViewGuestValue, even when the guest consented", () => {
    const { state, model } = makeState();
    const g = Object.values(state.guests).find((x) => x.roomId)!;
    g.consentPersonalization = true;
    const snapshot = buildOpsSnapshot(state, model, "executive-housekeeper");
    const entry = snapshot.guests.find((x) => x.id === g.id)!;
    expect(entry.totalSpend).toBeNull();
  });

  it("masks guest spend for a value-viewing role when the guest has not consented", () => {
    const { state, model } = makeState();
    const g = Object.values(state.guests).find((x) => x.roomId)!;
    g.consentPersonalization = false;
    const snapshot = buildOpsSnapshot(state, model, "gm");
    const entry = snapshot.guests.find((x) => x.id === g.id)!;
    expect(entry.totalSpend).toBeNull();
  });

  it("flags an SLA-breached open request correctly", () => {
    const { state, model } = makeState();
    const roomId = model.rooms[0].id;
    state.requests = {
      "r-1": { id: "r-1", roomId, guestId: null, type: "maintenance", text: "test", createdAt: state.t - 100, status: "open", assignedTo: null, slaMin: 30, completedAt: null, source: "guest" },
    };
    const snapshot = buildOpsSnapshot(state, model, "gm");
    expect(snapshot.openRequests).toHaveLength(1);
    expect(snapshot.openRequests[0].slaBreached).toBe(true);
  });

  it("excludes completed requests from openRequests", () => {
    const { state, model } = makeState();
    const roomId = model.rooms[0].id;
    state.requests = {
      "r-1": { id: "r-1", roomId, guestId: null, type: "maintenance", text: "test", createdAt: state.t - 100, status: "done", assignedTo: null, slaMin: 30, completedAt: state.t - 10, source: "guest" },
    };
    const snapshot = buildOpsSnapshot(state, model, "gm");
    expect(snapshot.openRequests).toHaveLength(0);
  });
});
