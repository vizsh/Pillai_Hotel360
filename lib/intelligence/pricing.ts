import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { DAY } from "@/lib/sim/seed";
import { clamp } from "@/lib/utils";
import { segmentGuests, type Cluster } from "./segmentation";

export interface PricingInputs {
  occupancy: number;
  pacing: number;
  seasonality: number;
  dow: number;
  competitorIndex: number;
  elasticity: number;
  eventUplift: number;
  elasticitySource: "segment-blend" | "population-default";
}

export interface SegmentRate {
  cluster: Cluster;
  elasticity: number;
  recommendedMultiplier: number;
  recommendedAdr: number;
  currentAdr: number;
  revparDelta: number;
}

export interface PricingResult {
  inputs: PricingInputs;
  currentMultiplier: number;
  recommendedMultiplier: number;
  currentAdr: number;
  recommendedAdr: number;
  projectedOccupancy: number;
  projectedRevpar: number;
  currentRevpar: number;
  curve: { mult: number; occ: number; revpar: number }[];
}

const seasonFor = (scenario: string, dayOfYear: number) => {
  const base = 0.5 + 0.5 * Math.sin(((dayOfYear - 340) / 365) * Math.PI * 2);
  const s = { "peak-season": 0.92, "monsoon-lull": 0.28, "conference-block": 0.7, "equipment-crisis": 0.75, "vip-arrival": 0.82 }[scenario] ?? base;
  return s;
};

/** Population-weighted elasticity from the current guest segmentation, falling back
 * to a seasonality-only default when there aren't enough in-house guests to cluster
 * (segmentGuests requires 5+). This is what makes the pricing engine's core number
 * actually move with segmentation output, not just display it side by side. */
function blendedElasticity(state: SimState, model: ResortModel, seasonality: number): { elasticity: number; source: PricingInputs["elasticitySource"]; clusters: Cluster[] } {
  const clusters = segmentGuests(state, model);
  const totalSize = clusters.reduce((s, c) => s + c.size, 0);
  if (!clusters.length || totalSize === 0) {
    return { elasticity: -1.15 + seasonality * 0.45, source: "population-default", clusters: [] };
  }
  const weighted = clusters.reduce((s, c) => s + c.elasticity * c.size, 0) / totalSize;
  return { elasticity: weighted, source: "segment-blend", clusters };
}

function optimizeCurve(elasticity: number, baseOcc: number, weekend: number, eventUplift: number, seasonality: number, competitorIndex: number, currentMultiplier: number, avgRate: number) {
  const demandAt = (mult: number) => {
    const priceRatio = mult / currentMultiplier;
    const d = baseOcc * Math.pow(priceRatio, elasticity) * (1 + weekend + eventUplift) * (0.85 + seasonality * 0.25) * (competitorIndex >= mult ? 1.03 : 1 - (mult - competitorIndex) * 0.6);
    return clamp(d, 0.05, 0.99);
  };
  const curve: PricingResult["curve"] = [];
  let best = { mult: currentMultiplier, revpar: -1, occ: 0 };
  for (let m = 0.7; m <= 1.6; m += 0.025) {
    const occ = demandAt(m);
    const revpar = avgRate * m * occ;
    curve.push({ mult: +m.toFixed(3), occ, revpar });
    if (revpar > best.revpar && occ > 0.25) best = { mult: +m.toFixed(3), revpar, occ };
  }
  return { curve, best, currentOcc: demandAt(currentMultiplier) };
}

export function computePricing(state: SimState, model: ResortModel): PricingResult {
  const day = Math.floor(state.t / DAY);
  const dow = day % 7;
  const seasonality = seasonFor(state.scenario, (day * 3) % 365);
  const occupancy = state.kpis.occupancy;
  const hist = state.kpiHistory.slice(-48);
  const pacing = hist.length > 4 ? occupancy - hist[0].occupancy : 0;
  const competitorIndex = { "peak-season": 1.08, "monsoon-lull": 0.86, "conference-block": 1.02, "equipment-crisis": 0.98, "vip-arrival": 1.04 }[state.scenario] ?? 1;
  const { elasticity, source } = blendedElasticity(state, model, seasonality);
  const eventUplift = state.scenario === "conference-block" ? 0.12 : 0;
  const weekend = dow === 5 || dow === 6 ? 0.06 : 0;
  const rooms = Object.values(state.rooms);
  const totalRooms = rooms.length;
  const baseOcc = clamp(occupancy, 0.05, 0.99);
  const avgRate = rooms.reduce((s, r) => s + r.rate, 0) / totalRooms / state.rateMultiplier;

  const { curve, best, currentOcc } = optimizeCurve(elasticity, baseOcc, weekend, eventUplift, seasonality, competitorIndex, state.rateMultiplier, avgRate);

  return {
    inputs: { occupancy, pacing, seasonality, dow, competitorIndex, elasticity, eventUplift, elasticitySource: source },
    currentMultiplier: state.rateMultiplier,
    recommendedMultiplier: best.mult,
    currentAdr: avgRate * state.rateMultiplier,
    recommendedAdr: avgRate * best.mult,
    projectedOccupancy: best.occ,
    projectedRevpar: best.revpar,
    currentRevpar: avgRate * state.rateMultiplier * currentOcc,
    curve,
  };
}

/** Per-segment "what would this cluster support" rates: same demand-curve optimizer,
 * substituting each cluster's own elasticity while holding seasonality/competitor/pacing
 * fixed. Surfaces on the Revenue dashboard as guidance, not a queued recommendation —
 * there's no live rate-fencing mechanism in the sim, so this is analysis, not an action. */
export function computeSegmentPricing(state: SimState, model: ResortModel): SegmentRate[] {
  const day = Math.floor(state.t / DAY);
  const dow = day % 7;
  const seasonality = seasonFor(state.scenario, (day * 3) % 365);
  const competitorIndex = { "peak-season": 1.08, "monsoon-lull": 0.86, "conference-block": 1.02, "equipment-crisis": 0.98, "vip-arrival": 1.04 }[state.scenario] ?? 1;
  const eventUplift = state.scenario === "conference-block" ? 0.12 : 0;
  const weekend = dow === 5 || dow === 6 ? 0.06 : 0;
  const rooms = Object.values(state.rooms);
  const avgRate = rooms.reduce((s, r) => s + r.rate, 0) / rooms.length / state.rateMultiplier;
  const baseOcc = clamp(state.kpis.occupancy, 0.05, 0.99);

  const clusters = segmentGuests(state, model);
  return clusters
    .filter((c) => c.size > 0)
    .map((cluster) => {
      const { best, currentOcc } = optimizeCurve(cluster.elasticity, baseOcc, weekend, eventUplift, seasonality, competitorIndex, state.rateMultiplier, avgRate);
      return {
        cluster,
        elasticity: cluster.elasticity,
        recommendedMultiplier: best.mult,
        recommendedAdr: avgRate * best.mult,
        currentAdr: avgRate * state.rateMultiplier,
        revparDelta: avgRate * best.mult * best.occ - avgRate * state.rateMultiplier * currentOcc,
      };
    })
    .sort((a, b) => b.cluster.size - a.cluster.size);
}

export function pricingRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const p = computePricing(state, model);
  const delta = p.recommendedMultiplier - p.currentMultiplier;
  if (Math.abs(delta) < 0.04) return [];
  const dir = delta > 0 ? "Raise" : "Lower";
  const revparDelta = p.projectedRevpar - p.currentRevpar;
  return [
    {
      id: "rec-price-bar",
      module: "pricing",
      title: `${dir} BAR ${Math.abs(delta * 100).toFixed(0)}% → ₹${Math.round(p.recommendedAdr).toLocaleString("en-IN")} ADR`,
      body: `Demand model finds the RevPAR optimum at ${(p.recommendedMultiplier * 100).toFixed(0)}% of base rate. Projected occupancy ${(p.projectedOccupancy * 100).toFixed(0)}%.`,
      confidence: clamp(0.55 + Math.min(0.3, Math.abs(revparDelta) / 2000) + Math.min(0.1, state.kpiHistory.length / 300), 0, 0.92),
      basis: [
        `occupancy ${(p.inputs.occupancy * 100).toFixed(1)}% · pacing ${p.inputs.pacing >= 0 ? "+" : ""}${(p.inputs.pacing * 100).toFixed(1)} pts / 48h`,
        `seasonality index ${p.inputs.seasonality.toFixed(2)} · competitor rate index ${p.inputs.competitorIndex.toFixed(2)}`,
        `price elasticity ${p.inputs.elasticity.toFixed(2)}${p.inputs.eventUplift ? ` · event uplift +${(p.inputs.eventUplift * 100).toFixed(0)}%` : ""}`,
        p.inputs.elasticitySource === "segment-blend"
          ? "elasticity is a guest-count-weighted blend of the current k-means segments, not a fixed constant"
          : "fewer than 5 in-house guests to segment — using the seasonality-only default elasticity",
      ],
      impact: `RevPAR ${revparDelta >= 0 ? "+" : ""}₹${Math.round(revparDelta).toLocaleString("en-IN")} per room-night (${((revparDelta / Math.max(1, p.currentRevpar)) * 100).toFixed(1)}%).`,
      action: `Apply rate multiplier ${p.recommendedMultiplier.toFixed(2)}× across all room types.`,
      targetKind: "resort",
      targetId: "pricing",
      createdAt: state.t,
      status: "pending",
      payload: { multiplier: p.recommendedMultiplier },
    },
  ];
}
