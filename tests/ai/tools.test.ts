import { describe, expect, it } from "vitest";
import { executeTool, safeCalculate, suggestTools, ungroundedFigures, precomputeUserMath } from "@/lib/ai/tools";
import { composeAnswer } from "@/lib/ai/composers";
import { searchKnowledge } from "@/lib/ai/systemKnowledge";
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
  financials: { totalRooms: 130, occupiedRooms: 104, trevpar: 14000, ancillaryRevenueToday: 100000, organicAncillaryToday: 200000, directBookingShare: 0.4, otaCommissionSavedToday: 30000, energyToday: 90000, energySavedToday: 5000, staffOnShift: 40, currentRateMultiplier: 1, recommendedRateMultiplier: 1.08, currentAdr: 15000, recommendedAdr: 16200, currentRevpar: 12000, projectedRevpar: 12600, projectedOccupancy: 0.78, elasticity: 1.3 },
  weather: { source: "simulated", days: [{ dayOffset: 0, condition: "rain", tempC: 28, rainProbability: 0.8, narrative: "Rain", fnbSpendMultiplier: 1.28, daytimePresenceBump: 0.22, zoneMultiplier: { "pool-deck": 0.56 } }] },
  signals: { source: "live", concernScore: 0.42, trendScore: null, sources: { gdacs: true, reddit: false }, hazards: [{ name: "Cyclone X", eventType: "TC", alertLevel: "Green", fromDate: "2026-09-25", distanceKmFromResort: 1200 }], headlines: [{ source: "newsapi", title: "Heavy rain expected in Goa" }] },
  assets: [{ name: "Chiller-1", kind: "chiller", floor: 0, status: "warning", failureProb7d: 0.62, rulDays: 9, health: 0.55 }],
  pendingRecommendations: [
    { module: "pricing", title: "Raise weekend rate", confidence: 0.8, impact: "+₹58,000", targetKind: "resort", targetId: "pricing" },
    { module: "personalization", title: "Asha Rao · 204: Offer spa upgrade", confidence: 0.85, impact: "+₹4,500", targetKind: "guest", targetId: "g-1" },
    { module: "personalization", title: "Raj Mehta · 512: Late checkout offer", confidence: 0.7, impact: "+₹0", targetKind: "guest", targetId: "g-2" },
  ],
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

describe("executeTool: list_planned_actions", () => {
  it("lists every pending recommendation by default", () => {
    const result = executeTool({ name: "list_planned_actions", arguments: {} }, snapshot) as { count: number };
    expect(result.count).toBe(3);
  });

  it("filters to actions planned for VIP guests only", () => {
    const result = executeTool({ name: "list_planned_actions", arguments: { vipOnly: true } }, snapshot) as { count: number; actions: { title: string }[] };
    expect(result.count).toBe(1);
    expect(result.actions[0].title).toContain("Asha Rao");
  });

  it("filters to actions planned for a named guest", () => {
    const result = executeTool({ name: "list_planned_actions", arguments: { guestName: "raj" } }, snapshot) as { count: number; actions: { title: string }[] };
    expect(result.count).toBe(1);
    expect(result.actions[0].title).toContain("Raj Mehta");
  });

  it("excludes resort-wide (non-guest) actions when filtering by vipOnly", () => {
    const result = executeTool({ name: "list_planned_actions", arguments: { vipOnly: true } }, snapshot) as { actions: { module: string }[] };
    expect(result.actions.every((a) => a.module !== "pricing")).toBe(true);
  });
});

describe("executeTool: get_resort_summary", () => {
  it("surfaces the snapshot's KPIs (occupancy as a whole-number percentage) and counts", () => {
    const result = executeTool({ name: "get_resort_summary", arguments: {} }, snapshot) as { occupancyPercent: number; openRequests: number };
    expect(result.occupancyPercent).toBe(80);
    expect(result.openRequests).toBe(2);
  });
});

describe("executeTool: numbers are rounded to something a chat table should actually show", () => {
  // Verified live this was a real, shipped bug: the model faithfully copied a raw
  // 0.8233020963248183-style confidence straight into a Markdown table cell because nothing
  // upstream had ever rounded it. These lock in the fix at its source (the tool boundary),
  // not just at the prompt-instruction layer.
  const messySnapshot: OpsSnapshot = {
    ...snapshot,
    guests: [{ id: "g-1", name: "Asha Rao", room: "204", segment: "luxury", loyalty: "platinum", vip: true, sentiment: -0.400000001234, totalSpend: 45000 }],
    rooms: [{ number: "204", floor: 2, status: "occupied", guestName: "Asha Rao", guestId: "g-1", maintRisk: 0.8233020963248183 }],
    pendingRecommendations: [{ module: "pricing", title: "Raise weekend rate", confidence: 0.8233020963248183, impact: "+₹58,000", targetKind: "resort", targetId: "pricing" }],
  };

  it("rounds a room's maintenance risk to a whole-number percentage", () => {
    const result = executeTool({ name: "find_room", arguments: { query: "204" } }, messySnapshot) as { matches: { maintenanceRiskPercent: number }[] };
    expect(result.matches[0].maintenanceRiskPercent).toBe(82);
  });

  it("rounds a guest's sentiment to 2 decimal places", () => {
    const result = executeTool({ name: "list_guests", arguments: {} }, messySnapshot) as { guests: { sentiment: number }[] };
    expect(result.guests[0].sentiment).toBe(-0.4);
  });

  it("rounds a planned action's confidence to a whole-number percentage", () => {
    const result = executeTool({ name: "list_planned_actions", arguments: {} }, messySnapshot) as { actions: { confidencePercent: number }[] };
    expect(result.actions[0].confidencePercent).toBe(82);
  });
});

describe("executeTool: unknown tool", () => {
  it("returns an error object instead of throwing", () => {
    const result = executeTool({ name: "delete_everything", arguments: {} }, snapshot) as { error: string };
    expect(result.error).toContain("unknown tool");
  });
});

describe("new tools", () => {
  it("get_financials rounds money and reports pricing uplift", () => {
    const r = executeTool({ name: "get_financials", arguments: {} }, snapshot) as { totalRevenueToday: number; pricingEngine: { projectedRevparChangePercent: number } };
    expect(r.totalRevenueToday).toBe(1820000);
    expect(r.pricingEngine.projectedRevparChangePercent).toBe(5);
  });

  it("get_weather_whatif explains when the projection was not computed", () => {
    const r = executeTool({ name: "get_weather_whatif", arguments: {} }, snapshot) as { error?: string };
    expect(r.error).toBeTruthy();
  });

  it("get_public_signals separates live and unreachable sources", () => {
    const r = executeTool({ name: "get_public_signals", arguments: {} }, snapshot) as { concernScorePercent: number; sourcesLive: string[]; sourcesUnreachable: string[] };
    expect(r.concernScorePercent).toBe(42);
    expect(r.sourcesLive).toEqual(["gdacs"]);
    expect(r.sourcesUnreachable).toEqual(["reddit"]);
  });

  it("get_asset_risk returns rounded percentages", () => {
    const r = executeTool({ name: "get_asset_risk", arguments: {} }, snapshot) as { assets: { failureProbability7dPercent: number }[] };
    expect(r.assets[0].failureProbability7dPercent).toBe(62);
  });
});

describe("safeCalculate", () => {
  it("handles precedence, percent and powers", () => {
    expect(safeCalculate("100+20*3")).toEqual({ ok: true, result: 160 });
    expect(safeCalculate("1200 * 65% * (1 - 20%)")).toEqual({ ok: true, result: 624 });
    expect(safeCalculate("2^3^2")).toEqual({ ok: true, result: 512 });
    expect(safeCalculate("₹1,25,000 x 4")).toEqual({ ok: true, result: 500000 });
  });
  it("rejects garbage and division by zero without evaluating code", () => {
    expect(safeCalculate("process.exit(1)").ok).toBe(false);
    expect(safeCalculate("5/0").ok).toBe(false);
  });
});

describe("suggestTools + searchKnowledge", () => {
  it("routes indirect money and weather questions", () => {
    expect(suggestTools("If rain cuts pool revenue by 20% what do we lose?")).toEqual(expect.arrayContaining(["get_financials", "get_weather_outlook", "calculate"]));
  });
  it("finds the right system facts", () => {
    expect(searchKnowledge("which APIs do you integrate")[0].id).toBe("apis");
    expect(searchKnowledge("how is fire detected on cctv")[0].id).toBe("cctv");
    expect(searchKnowledge("explain the monte carlo what-if")[0].id).toBe("weather-whatif");
  });
});

describe("ungroundedFigures", () => {
  it("flags invented rupee figures but accepts grounded ones", () => {
    const data = "totalRevenueToday: 2149625, result: 537406.25";
    expect(ungroundedFigures("Revenue is ₹21,49,625 and 25% is ₹5,37,406", data)).toEqual([]);
    expect(ungroundedFigures("The pool-deck earns ₹1,20,000 a day", data)).toEqual([120000]);
  });
});

describe("precomputeUserMath", () => {
  it("annualises a monthly lakh figure and applies a percentage range", () => {
    const out = precomputeUserMath("We spend about ₹8 lakh a month on repairs. If we cut it by 20 to 40%, what do we save a year?")!;
    expect(out).toContain("₹96,00,000");
    expect(out).toContain("20% of ₹96,00,000 = ₹19,20,000");
    expect(out).toContain("40% of ₹96,00,000 = ₹38,40,000");
  });
  it("returns null when the user gave no amount", () => {
    expect(precomputeUserMath("how is the weather")).toBeNull();
  });
});

describe("composeAnswer", () => {
  it("answers the user-figure savings question exactly, no LLM", () => {
    const r = composeAnswer("We spend about ₹8 lakh a month on chiller repairs. If predictive maintenance cuts unplanned-failure cost by 20 to 40%, what do we save a year?", snapshot)!;
    expect(r.reply).toContain("₹19,20,000 to ₹38,40,000 per year");
  });
  it("re-prices commission at another OTA rate", () => {
    const r = composeAnswer("How much commission did direct bookings save us and what would it be at a 25% OTA rate?", snapshot)!;
    expect(r.reply).toContain("25%");
    expect(r.toolsUsed).toContain("get_financials");
  });
  it("treats a zone demand cut as outlet-level, not total revenue", () => {
    const r = composeAnswer("Suppose heavy rain cuts pool-deck demand by 55%. How much revenue is at risk?", snapshot)!;
    expect(r.reply).toContain("does not track revenue per outlet");
    expect(r.reply).toContain("₹55,000");
  });
  it("builds a templated weather briefing with actions", () => {
    const r = composeAnswer("Will the rain this week hurt us and how should we prepare?", snapshot)!;
    expect(r.reply).toContain("Suggested actions");
    expect(r.toolsUsed).toContain("get_weather_outlook");
  });
  it("leaves how-it-works weather questions to the knowledge tool", () => {
    expect(composeAnswer("How does the weather what-if work?", snapshot)).toBeNull();
  });
  it("falls through for open questions", () => {
    expect(composeAnswer("Who is in room 204?", snapshot)).toBeNull();
  });
});

describe("weather-briefing ₹ operating-exposure line (feature E)", () => {
  it("quantifies staffing + HVAC risk exposure from the same what-if bands, labelled illustrative", () => {
    const snap = { ...snapshot, weatherWhatIf: { rain: { scenario: { condition: "rain", tempC: 28, rainProbability: 0.9 }, narrative: "n", runs: 6, horizonHours: 8, occupancyDelta: { p10: 0, p50: 0, p90: 0 }, fnbDemandDelta: { p10: 0, p50: 0, p90: 0 }, energyDelta: { p10: 0, p50: 0, p90: 0 }, staffingUnmetDelta: { p10: 0, p50: 2, p90: 3 }, hvacRiskDelta: { p10: 0, p50: 0.02, p90: 0.03 }, openFnbConciergeRequestsDelta: { p10: 0, p50: 0, p90: 0 }, zoneMultiplier: {} }, heatwave: { scenario: { condition: "heatwave", tempC: 39, rainProbability: 0.02 }, narrative: "n", runs: 6, horizonHours: 8, occupancyDelta: { p10: 0, p50: 0, p90: 0 }, fnbDemandDelta: { p10: 0, p50: 0, p90: 0 }, energyDelta: { p10: 0, p50: 0, p90: 0 }, staffingUnmetDelta: { p10: 0, p50: 0, p90: 0 }, hvacRiskDelta: { p10: 0, p50: 0, p90: 0 }, openFnbConciergeRequestsDelta: { p10: 0, p50: 0, p90: 0 }, zoneMultiplier: {} } } } as unknown as typeof snapshot;
    const r = composeAnswer("A cyclone hits — how should we prepare?", snap)!;
    expect(r.reply).toContain("Modeled operating exposure");
    expect(r.reply).toContain("illustrative");
  });
});
