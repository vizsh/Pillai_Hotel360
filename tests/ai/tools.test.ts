import { describe, expect, it } from "vitest";
import { executeTool } from "@/lib/ai/tools";
import type { OpsSnapshot } from "@/lib/ai/opsSnapshot";

const snapshot: OpsSnapshot = {
  asOfSimTime: "day 1, 10:00",
  role: "gm",
  kpis: { occupancy: 0.8, adr: 15000, revpar: 12000, gss: 4.1, revenueToday: 500000 },
  rooms: [
    { number: "204", floor: 2, status: "occupied", guestName: "Asha Rao", guestId: "g-1", maintRisk: 0.1 },
    { number: "305", floor: 3, status: "vacant-clean", guestName: null, guestId: null, maintRisk: 0.6 },
    { number: "512", floor: 5, status: "occupied", guestName: "Raj Mehta", guestId: "g-2", maintRisk: 0.05 },
  ],
  guests: [
    { id: "g-1", name: "Asha Rao", room: "204", segment: "luxury", loyalty: "platinum", vip: true, sentiment: -0.4, totalSpend: 45000 },
    { id: "g-2", name: "Raj Mehta", room: "512", segment: "business", loyalty: "none", vip: false, sentiment: 0.5, totalSpend: null },
  ],
  openRequests: [
    { id: "r-1", room: "204", type: "maintenance", text: "AC noisy", status: "open", ageMinutes: 45, slaMin: 30, slaBreached: true, assignedTo: null },
    { id: "r-2", room: "512", type: "housekeeping", text: "towels", status: "assigned", ageMinutes: 5, slaMin: 20, slaBreached: false, assignedTo: "Priya" },
  ],
  openAlerts: [{ severity: "critical", kind: "asset-risk", title: "AHU-03 failure risk", body: "78%", ageMinutes: 10 }],
  pendingRecommendations: [{ module: "pricing", title: "Raise weekend rate", confidence: 0.8, impact: "+₹58,000" }],
};

describe("executeTool: find_room", () => {
  it("finds a room by exact room number", () => {
    const result = executeTool({ name: "find_room", arguments: { query: "204" } }, snapshot) as { found: boolean; matches: { room: string }[] };
    expect(result.found).toBe(true);
    expect(result.matches[0].room).toBe("204");
  });

  it("finds a room by guest name, case-insensitively", () => {
    const result = executeTool({ name: "find_room", arguments: { query: "asha" } }, snapshot) as { found: boolean; matches: { guest: { name: string } | null }[] };
    expect(result.found).toBe(true);
    expect(result.matches[0].guest?.name).toBe("Asha Rao");
  });

  it("reports not found rather than guessing for no match", () => {
    const result = executeTool({ name: "find_room", arguments: { query: "999" } }, snapshot) as { found: boolean };
    expect(result.found).toBe(false);
  });

  it("never includes a guest's totalSpend field being fabricated when null in the snapshot", () => {
    const result = executeTool({ name: "find_room", arguments: { query: "512" } }, snapshot) as { matches: { guest: { totalSpend: number | null } | null }[] };
    expect(result.matches[0].guest?.totalSpend).toBeNull();
  });
});

describe("executeTool: list_open_issues", () => {
  it("lists all open requests by default", () => {
    const result = executeTool({ name: "list_open_issues", arguments: {} }, snapshot) as { openRequestCount: number };
    expect(result.openRequestCount).toBe(2);
  });

  it("filters to only SLA-breached requests when asked", () => {
    const result = executeTool({ name: "list_open_issues", arguments: { onlyBreached: true } }, snapshot) as { requests: { room: string }[] };
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].room).toBe("204");
  });
});

describe("executeTool: list_guests", () => {
  it("filters to VIP guests", () => {
    const result = executeTool({ name: "list_guests", arguments: { filter: "vip" } }, snapshot) as { matchCount: number };
    expect(result.matchCount).toBe(1);
  });

  it("filters to unhappy guests (sentiment < -0.2)", () => {
    const result = executeTool({ name: "list_guests", arguments: { filter: "unhappy" } }, snapshot) as { guests: { name: string }[] };
    expect(result.guests).toHaveLength(1);
    expect(result.guests[0].name).toBe("Asha Rao");
  });

  it("returns everyone for filter 'all' or no filter", () => {
    const result = executeTool({ name: "list_guests", arguments: {} }, snapshot) as { matchCount: number };
    expect(result.matchCount).toBe(2);
  });
});

describe("executeTool: get_resort_summary", () => {
  it("surfaces the snapshot's KPIs and counts", () => {
    const result = executeTool({ name: "get_resort_summary", arguments: {} }, snapshot) as { occupancy: number; openRequests: number };
    expect(result.occupancy).toBe(0.8);
    expect(result.openRequests).toBe(2);
  });
});

describe("executeTool: unknown tool", () => {
  it("returns an error object instead of throwing", () => {
    const result = executeTool({ name: "delete_everything", arguments: {} }, snapshot) as { error: string };
    expect(result.error).toContain("unknown tool");
  });
});
