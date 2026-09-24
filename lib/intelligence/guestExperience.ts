import type { Guest, SimState } from "@/lib/sim/types";
import { SEGMENT_SPEND_MULTIPLIER } from "@/lib/sim/seed";
import { clamp } from "@/lib/utils";

export type ExperienceBand = "excellent" | "good" | "at-risk" | "poor";

export interface GuestExperienceScore {
  guestId: string;
  guestName: string;
  roomId: string | null;
  index: number;
  band: ExperienceBand;
  sentimentComponent: number;
  slaComponent: number;
  engagementComponent: number;
  loyaltyComponent: number;
  requestsTotal: number;
  requestsOnTime: number;
}

const LOYALTY_COMPONENT: Record<Guest["loyalty"], number> = { none: 0, silver: 0.3, gold: 0.6, platinum: 1 };
/** ₹/night ancillary spend a baseSpend-multiplier-1.0 guest (leisure-couple) needs to hit
 * for a "full marks" engagement component — read against SEGMENT_SPEND_MULTIPLIER so a
 * luxury guest's bar is proportionally higher, not the same flat number every segment. */
const ENGAGEMENT_BENCHMARK_PER_NIGHT = 1800;

/** One composite 0-1 score per guest rolling up sentiment, service delivery (SLA hit rate on
 * their own requests), ancillary engagement relative to their segment's own typical spend,
 * and loyalty tenure — the blueprint's guest-experience pillar as a single number a GM can
 * actually track, instead of three adjacent modules (sentiment, personalization, segmentation)
 * that each see one slice of it. Weighted 40% sentiment / 25% SLA / 20% engagement / 15%
 * loyalty: sentiment and service delivery are what the resort actually controls day to day;
 * engagement and loyalty describe the guest more than the stay, so they carry less weight. */
export function guestExperienceIndex(g: Guest, state: SimState): GuestExperienceScore {
  const sentimentComponent = clamp((g.sentiment + 1) / 2, 0, 1);

  const requests = Object.values(state.requests).filter((r) => r.guestId === g.id);
  const closedOrOverdue = requests.filter((r) => r.status === "done" || state.t - r.createdAt > r.slaMin);
  const onTime = closedOrOverdue.filter((r) => (r.status === "done" ? (r.completedAt ?? state.t) - r.createdAt <= r.slaMin : false));
  // No evaluable requests yet isn't evidence of bad service — default to a neutral-good score
  // rather than penalizing a guest who simply hasn't asked for anything.
  const slaComponent = closedOrOverdue.length ? onTime.length / closedOrOverdue.length : 0.75;

  const nightsSoFar = Math.max(1, (state.t - g.checkIn) / (24 * 60));
  const spendPerNight = (g.spendFnb + g.spendSpa + g.spendOther) / nightsSoFar;
  const benchmark = ENGAGEMENT_BENCHMARK_PER_NIGHT * SEGMENT_SPEND_MULTIPLIER[g.segment];
  const engagementComponent = clamp(spendPerNight / benchmark, 0, 1);

  const loyaltyComponent = LOYALTY_COMPONENT[g.loyalty];

  const index = clamp(sentimentComponent * 0.4 + slaComponent * 0.25 + engagementComponent * 0.2 + loyaltyComponent * 0.15, 0, 1);
  const band: ExperienceBand = index >= 0.75 ? "excellent" : index >= 0.55 ? "good" : index >= 0.35 ? "at-risk" : "poor";

  return {
    guestId: g.id,
    guestName: g.name,
    roomId: g.roomId,
    index,
    band,
    sentimentComponent,
    slaComponent,
    engagementComponent,
    loyaltyComponent,
    requestsTotal: closedOrOverdue.length,
    requestsOnTime: onTime.length,
  };
}

export interface ResortExperienceIndex {
  avgIndex: number;
  scores: GuestExperienceScore[];
  bandCounts: Record<ExperienceBand, number>;
}

export function resortExperienceIndex(state: SimState): ResortExperienceIndex {
  const scores = Object.values(state.guests)
    .filter((g) => g.roomId)
    .map((g) => guestExperienceIndex(g, state))
    .sort((a, b) => a.index - b.index);
  const bandCounts: Record<ExperienceBand, number> = { excellent: 0, good: 0, "at-risk": 0, poor: 0 };
  for (const s of scores) bandCounts[s.band]++;
  return {
    avgIndex: scores.length ? scores.reduce((sum, s) => sum + s.index, 0) / scores.length : 0,
    scores,
    bandCounts,
  };
}
