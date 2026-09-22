import { describe, expect, it } from "vitest";
import { acceptRecommendation, dismissRecommendationLogged } from "@/lib/api/recommendationActions";
import { refreshRecommendations } from "@/lib/sim/engine";
import { makeState } from "../helpers";

describe("acceptRecommendation / dismissRecommendationLogged", () => {
  it("does not throw when the recommendation was pruned from state before the click landed", () => {
    // The exact race this guards: a card renders with a stale `rec` object, the 30-minute
    // module refresh prunes it out of state.recommendations, then the click handler fires
    // with that now-dangling reference. This should be a no-op, not a crash.
    const { state, model } = makeState();
    const staleRec = { id: "rec-does-not-exist", module: "maintenance" as const, title: "Stale", body: "", confidence: 0.8, basis: [], impact: "", action: "", targetKind: "asset" as const, targetId: "x", createdAt: state.t, status: "pending" as const };
    const mutate = (fn: (s: typeof state) => void) => fn(state);
    expect(() => acceptRecommendation(mutate, model, staleRec)).not.toThrow();
    expect(() => dismissRecommendationLogged(mutate, staleRec)).not.toThrow();
  });

  it("actually applies the action when the recommendation is live", () => {
    const { state, model } = makeState();
    refreshRecommendations(state, model); // seedState starts with none — force a real pass
    const id = Object.keys(state.recommendations)[0];
    expect(id).toBeDefined();
    if (!id) return;
    const rec = state.recommendations[id];
    const mutate = (fn: (s: typeof state) => void) => fn(state);
    dismissRecommendationLogged(mutate, rec);
    expect(state.recommendations[id].status).toBe("dismissed");
  });
});
