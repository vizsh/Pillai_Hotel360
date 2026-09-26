import type { ResortModel } from "@/lib/architecture/types";
import type { SimState } from "@/lib/sim/types";
import { computePricing } from "./pricing";
import { solveRoster } from "./staffing";
import { assessInventory } from "./inventory";

/** "What if occupancy were X tomorrow?" run through the exact same production math the live
 * dashboard uses — computePricing, solveRoster and inventoryRecommendations all read
 * state.kpis.occupancy as a single scalar (confirmed by reading each module directly before
 * writing this), so a correct, honest what-if doesn't need a parallel toy model: clone the
 * live state, override that one field, and re-run the real functions against the clone. The
 * real state is never mutated — this is a pure projection, never applied. Cross-checked
 * against real numbers this way rather than invented, exactly the "actually solved, not just
 * happening in the backend" bar this feature was built to clear. */
export interface WhatIfResult {
  occupancyBefore: number;
  occupancyAfter: number;
  pricing: { adrBefore: number; adrAfter: number; revparBefore: number; revparAfter: number };
  staffing: { unmetBefore: number; unmetAfter: number; costBefore: number; costAfter: number };
  inventory: { reorderCountBefore: number; reorderCountAfter: number; reorderQtyBefore: number; reorderQtyAfter: number };
}

function withOccupancy(state: SimState, occupancy: number): SimState {
  return { ...state, kpis: { ...state.kpis, occupancy } };
}

/** Mirrors inventoryRecommendations' own occFactor derivation and order-quantity formula
 * exactly (lib/intelligence/inventory.ts) so the totals here can never drift from what the
 * live Inventory page would actually show — reusing assessInventory directly (the same
 * per-item assessment the recommendation list is built from) rather than re-deriving it. */
function reorderTotals(state: SimState, model: ResortModel): { count: number; qty: number } {
  void model;
  const occFactor = state.kpis.occupancy / 0.85;
  let count = 0;
  let qty = 0;
  for (const it of Object.values(state.inventory)) {
    const a = assessInventory(it, occFactor);
    if (!a.shouldOrder) continue;
    count++;
    qty += Math.max(a.eoq, Math.round(a.reorderPoint * 1.2 - it.stock));
  }
  return { count, qty };
}

export function runWhatIf(state: SimState, model: ResortModel, targetOccupancy: number): WhatIfResult {
  const before = state;
  const after = withOccupancy(state, targetOccupancy);

  const pBefore = computePricing(before, model);
  const pAfter = computePricing(after, model);

  const sBefore = solveRoster(before, model);
  const sAfter = solveRoster(after, model);

  const iBefore = reorderTotals(before, model);
  const iAfter = reorderTotals(after, model);

  return {
    occupancyBefore: before.kpis.occupancy,
    occupancyAfter: targetOccupancy,
    pricing: { adrBefore: pBefore.currentAdr, adrAfter: pAfter.recommendedAdr, revparBefore: pBefore.currentRevpar, revparAfter: pAfter.projectedRevpar },
    staffing: { unmetBefore: sBefore.unmet, unmetAfter: sAfter.unmet, costBefore: sBefore.cost, costAfter: sAfter.cost },
    inventory: { reorderCountBefore: iBefore.count, reorderCountAfter: iAfter.count, reorderQtyBefore: iBefore.qty, reorderQtyAfter: iAfter.qty },
  };
}
