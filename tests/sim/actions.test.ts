import { describe, expect, it } from "vitest";
import { completeRequestExternally, reportIssueFromStaff } from "@/lib/sim/actions";
import { makeState } from "../helpers";

describe("completeRequestExternally", () => {
  it("marks an open request done, stamps completedAt, and resolves its SLA alert", () => {
    const { state, model } = makeState();
    const roomId = model.rooms[0].id;
    state.requests = { "rq-1": { id: "rq-1", roomId, guestId: null, type: "housekeeping", text: "towels", createdAt: state.t - 10, status: "open", assignedTo: null, slaMin: 20, completedAt: null, source: "guest" } };
    state.alerts["sla-rq-1"] = { id: "sla-rq-1", severity: "warn", kind: "sla", targetKind: "room", targetId: roomId, title: "SLA breach", body: "x", createdAt: state.t, resolvedAt: null };

    const applied = completeRequestExternally(state, model, "rq-1", "Priya");
    expect(applied).toBe(true);
    expect(state.requests["rq-1"].status).toBe("done");
    expect(state.requests["rq-1"].completedAt).toBe(state.t);
    expect(state.alerts["sla-rq-1"].resolvedAt).toBe(state.t);
  });

  it("frees the assigned staff member back to idle when they were on this exact task", () => {
    const { state, model } = makeState();
    const roomId = model.rooms[0].id;
    const staffId = Object.keys(state.staff)[0];
    state.staff[staffId].status = "working";
    state.staff[staffId].taskId = "rq-1";
    state.requests = { "rq-1": { id: "rq-1", roomId, guestId: null, type: "housekeeping", text: "towels", createdAt: state.t - 10, status: "in-progress", assignedTo: staffId, slaMin: 20, completedAt: null, source: "guest" } };

    completeRequestExternally(state, model, "rq-1", "Priya");
    expect(state.staff[staffId].status).toBe("idle");
    expect(state.staff[staffId].taskId).toBeNull();
  });

  it("returns false and makes no change for an unknown or already-done request", () => {
    const { state, model } = makeState();
    expect(completeRequestExternally(state, model, "does-not-exist", "Priya")).toBe(false);

    const roomId = model.rooms[0].id;
    state.requests = { "rq-1": { id: "rq-1", roomId, guestId: null, type: "housekeeping", text: "towels", createdAt: state.t - 10, status: "done", assignedTo: null, slaMin: 20, completedAt: state.t - 5, source: "guest" } };
    expect(completeRequestExternally(state, model, "rq-1", "Priya")).toBe(false);
  });
});

describe("reportIssueFromStaff", () => {
  it("creates a new open request routed by the same classifier a guest message uses", () => {
    const { state, model } = makeState();
    const roomId = model.rooms[0].id;
    const before = Object.keys(state.requests).length;

    const req = reportIssueFromStaff(state, model, roomId, "AC is rattling and not cooling", "Arjun");
    expect(Object.keys(state.requests).length).toBe(before + 1);
    expect(req.type).toBe("maintenance");
    expect(req.source).toBe("staff");
    expect(req.roomId).toBe(roomId);
  });

  it("logs a feed event naming the reporting staff member", () => {
    const { state, model } = makeState();
    const roomId = model.rooms[0].id;
    reportIssueFromStaff(state, model, roomId, "towels needed", "Priya");
    expect(state.feed.some((f) => f.text.includes("Priya") && f.text.includes("Telegram"))).toBe(true);
  });
});
