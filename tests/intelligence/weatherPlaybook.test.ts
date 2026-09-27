import { describe, expect, it } from "vitest";
import { archetypeFor, playbookRecommendations, PLAYBOOKS } from "@/lib/intelligence/weatherPlaybook";
import { makeState } from "../helpers";

describe("weather playbook (feature C)", () => {
  it("maps condition + rain probability to the right archetype", () => {
    expect(archetypeFor("rain", 0.8)).toBe("monsoon-lull");
    expect(archetypeFor("rain", 0.2)).toBe("clear");
    expect(archetypeFor("heatwave", 0.05)).toBe("heatwave-spike");
    expect(archetypeFor("clear", 0.1)).toBe("clear");
  });

  it("every archetype has a non-empty checklist", () => {
    for (const p of Object.values(PLAYBOOKS)) expect(p.checklist.length).toBeGreaterThan(0);
  });

  it("bundles only pending weather/staffing/energy recommendations, not e.g. pricing", () => {
    const { state, model } = makeState();
    state.recommendations["r1"] = { id: "r1", module: "weather", title: "t", body: "b", confidence: 0.5, basis: [], impact: "i", action: "a", targetKind: "resort", targetId: "x", createdAt: 0, status: "pending" };
    state.recommendations["r2"] = { id: "r2", module: "pricing", title: "t", body: "b", confidence: 0.5, basis: [], impact: "i", action: "a", targetKind: "resort", targetId: "x", createdAt: 0, status: "pending" };
    state.recommendations["r3"] = { id: "r3", module: "energy", title: "t", body: "b", confidence: 0.5, basis: [], impact: "i", action: "a", targetKind: "resort", targetId: "x", createdAt: 0, status: "dismissed" };
    const bundle = playbookRecommendations(state, model);
    expect(bundle.map((r) => r.id)).toEqual(["r1"]);
  });
});
