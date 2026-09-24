import type { ResortModel } from "@/lib/architecture/types";
import type { ModuleId, Recommendation, SimState } from "@/lib/sim/types";
import { pricingRecommendations } from "./pricing";
import { housekeepingBurnoutRecommendations, staffingRecommendations } from "./staffing";
import { inventoryRecommendations } from "./inventory";
import { segmentationRecommendations } from "./segmentation";
import { personalizationRecommendations } from "./personalization";
import { guestImpactRecommendations } from "./guestImpact";
import { energyRecommendations } from "./energy";
import { groupBlockRecommendations } from "./groupBlocks";
import { guestRecoveryRecommendations } from "./guestRecovery";
import { weatherRecommendations } from "./weather";

export const moduleMeta: Record<ModuleId, { label: string; short: string; color: string; description: string; method: string }> = {
  maintenance: { label: "Predictive Maintenance", short: "MAINT", color: "#f4436c", description: "Survival models on asset telemetry surface failures before a guest notices one.", method: "Weibull hazard + telemetry anomaly z-scores" },
  pricing: { label: "Dynamic Pricing", short: "PRICE", color: "#2dd4bf", description: "Demand, pacing, seasonality and elasticity resolve to a rate you can accept in one click.", method: "Constant-elasticity demand curve, RevPAR grid search" },
  staffing: { label: "Intelligent Staffing", short: "STAFF", color: "#f5a524", description: "Forecast demand per department, then solve the roster against availability.", method: "Hourly demand profiles, greedy allocation + swap improvement" },
  inventory: { label: "Inventory Optimization", short: "INV", color: "#c084fc", description: "Consumption forecasting with reorder points that respect lead time and stockout risk.", method: "Holt linear forecast, safety stock, EOQ" },
  personalization: { label: "Guest Personalization", short: "NBA", color: "#34d399", description: "Preferences, history and stay-stage resolve to a next-best action per guest.", method: "Rule-scored next-best-action ranking" },
  concierge: { label: "AI Concierge", short: "CHAT", color: "#60a5fa", description: "Requests are classified, dispatched and tracked as real work on the twin.", method: "Weighted keyword intent classifier with urgency detection" },
  sentiment: { label: "Sentiment Analysis", short: "SENT", color: "#f472b6", description: "Aspect-level scoring across reviews routes the complaint to the department.", method: "Aspect lexicon with clause-level negation" },
  segmentation: { label: "Guest Segmentation", short: "SEG", color: "#94a3b8", description: "Behavioral clustering that produces segments you can price and market against.", method: "k-means (k=5, k-means++ init) on 6 normalized features" },
  relocation: { label: "Guest Impact & Relocation", short: "RELOC", color: "#f5a524", description: "When climate control fails, matches displaced guests to vacant rooms outside the affected zone and escorts them.", method: "Greedy same-or-better-type matching against vacant-clean inventory" },
  energy: { label: "Energy Intelligence", short: "NRG", color: "#4ade80", description: "Vacant rooms drawing full conditioning load are flagged and unconditioned automatically — no guest impact, pure waste recovered.", method: "Occupancy-gated HVAC waste detection against a fixed conditioned/unconditioned rate delta" },
  groupblock: { label: "Group Block Optimizer", short: "GRP", color: "#818cf8", description: "Compares what the current group/event block is paying against transient ADR for the same occupied inventory, and flags when the gap is large enough to matter.", method: "Displacement analysis — group ADR vs. transient ADR at current occupancy" },
  recovery: { label: "In-Stay Guest Recovery", short: "RECOV", color: "#fb7185", description: "Scores silently unhappy in-house guests from request delays and sentiment before checkout, and sizes a recovery gesture to the guest's value and the issue's severity.", method: "Weighted risk score (sentiment + SLA breach density) gated to a pre-checkout window" },
  weather: { label: "Weather & Event Radar", short: "WX", color: "#38bdf8", description: "A deterministic 7-day weather forecast drives rain and heatwave operating playbooks, and heat-linked AC wear feeds straight into predictive maintenance.", method: "Seeded per-day forecast; rain/heatwave playbooks gated on occupancy and lead time" },
};

export function runModules(state: SimState, model: ResortModel): Recommendation[] {
  return [
    ...pricingRecommendations(state, model),
    ...staffingRecommendations(state, model),
    ...housekeepingBurnoutRecommendations(state),
    ...inventoryRecommendations(state, model),
    ...segmentationRecommendations(state, model),
    ...personalizationRecommendations(state, model),
    ...guestImpactRecommendations(state, model),
    ...energyRecommendations(state, model),
    ...groupBlockRecommendations(state, model),
    ...guestRecoveryRecommendations(state, model),
    ...weatherRecommendations(state, model),
  ];
}
