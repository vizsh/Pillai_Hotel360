import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { executeRecommendation, dismissRecommendation } from "@/lib/sim/actions";
import { logAction } from "./backend";

type Mutate = (fn: (s: SimState) => void) => void;

/** Every "Accept"/"Dismiss" button across the app (recommendation dock, and 6 analytics
 * pages) goes through these two functions instead of calling mutate(...) directly, so the
 * audit log (app/api/actions, backed by a real SQLite table) has exactly one, complete
 * record of every decision — not a partial one some call sites forgot to log. */

export function acceptRecommendation(mutate: Mutate, model: ResortModel, rec: Recommendation) {
  let t = rec.createdAt;
  mutate((s) => {
    t = s.t;
    executeRecommendation(s, model, s.recommendations[rec.id]);
  });
  logAction({ type: "recommendation.accepted", module: rec.module, summary: rec.title, payload: { id: rec.id, confidence: rec.confidence, impact: rec.impact, action: rec.action }, t });
}

export function dismissRecommendationLogged(mutate: Mutate, rec: Recommendation) {
  let t = rec.createdAt;
  mutate((s) => {
    t = s.t;
    dismissRecommendation(s, s.recommendations[rec.id]);
  });
  logAction({ type: "recommendation.dismissed", module: rec.module, summary: rec.title, payload: { id: rec.id }, t });
}
