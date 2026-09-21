import { getModel } from "@/lib/architecture/model";
import { seedState } from "@/lib/sim/seed";
import type { Scenario, SimState } from "@/lib/sim/types";
import type { ResortModel } from "@/lib/architecture/types";

/** Shared fixture used across the intelligence-module test suite — a freshly seeded state
 * for the real (not mocked) resort model, deterministic given (seed, scenario). */
export function makeState(scenario: Scenario = "peak-season", seed = 1): { state: SimState; model: ResortModel } {
  const model = getModel();
  const state = seedState(model, seed, scenario);
  return { state, model };
}
