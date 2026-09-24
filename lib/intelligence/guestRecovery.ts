import type { ResortModel } from "@/lib/architecture/types";
import type { Guest, Recommendation, SimState } from "@/lib/sim/types";
import { clamp } from "@/lib/utils";

/** Below this, checkout isn't close enough for a "before they leave" recovery task to make
 * sense — the blueprint's own scenario (Room 214) and the service-recovery research below
 * both frame this as a pre-checkout window, not a general unhappiness flag. */
const CHECKOUT_WINDOW_MIN = 36 * 60;
const RISK_THRESHOLD = 0.5;

export interface GuestRiskAssessment {
  guestId: string;
  guestName: string;
  roomId: string;
  riskScore: number;
  delayedRequests: number;
  sentiment: number;
  guestValue: number;
  minutesToCheckout: number;
  gesture: string;
}

function gestureFor(g: Guest, riskScore: number, guestValue: number): string {
  const highValue = guestValue > 15000 || g.loyalty === "platinum" || g.loyalty === "gold" || g.vip;
  if (riskScore > 0.75 && highValue) return "Duty manager visit + complimentary late checkout";
  if (riskScore > 0.75) return "Duty manager call + spa voucher";
  if (highValue) return "Handwritten apology note + dessert on the house";
  return "Front desk follow-up call + amenity credit";
}

/** Scores every in-house guest's risk of leaving unhappy without ever complaining loudly
 * enough to trigger anything else in the system — the blueprint's "silent unhappy guest"
 * problem, distinct from lib/intelligence/guestImpact.ts's relocation (an equipment-outage
 * response, not a dissatisfaction score). Risk blends unresolved-request delay with the
 * guest's own sentiment trend; gesture is sized to both severity and guest value, per the
 * blueprint's explicit ask and consistent with research on 525 upscale hotels' complaint
 * handling: only 68% of service recoveries land inside the guest's expected timeframe, and
 * only complete, timely resolution (not the gesture alone) predicts repeat patronage — which
 * is why this only ever fires with checkout still ahead, never as a post-stay postmortem. */
export function assessGuestRisk(state: SimState, model: ResortModel): GuestRiskAssessment[] {
  const out: GuestRiskAssessment[] = [];
  for (const g of Object.values(state.guests)) {
    if (!g.roomId) continue;
    const minutesToCheckout = g.checkOut - state.t;
    if (minutesToCheckout <= 0 || minutesToCheckout > CHECKOUT_WINDOW_MIN) continue;

    const delayedRequests = Object.values(state.requests).filter((r) => r.guestId === g.id && r.status !== "done" && state.t - r.createdAt > r.slaMin).length;
    const sentimentRisk = clamp(-g.sentiment, 0, 1);
    const delayRisk = clamp(delayedRequests / 2, 0, 1);
    const riskScore = clamp(sentimentRisk * 0.55 + delayRisk * 0.45, 0, 1);
    if (riskScore < RISK_THRESHOLD) continue;

    const guestValue = g.spendRoom + g.spendFnb + g.spendSpa + g.spendOther;
    out.push({
      guestId: g.id,
      guestName: g.name,
      roomId: g.roomId,
      riskScore,
      delayedRequests,
      sentiment: g.sentiment,
      guestValue,
      minutesToCheckout,
      gesture: gestureFor(g, riskScore, guestValue),
    });
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
}

export function guestRecoveryRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const atRisk = assessGuestRisk(state, model);
  return atRisk.slice(0, 3).map((a) => {
    const room = model.roomById.get(a.roomId);
    return {
      id: `rec-recovery-${a.guestId}`,
      module: "recovery",
      title: `${a.guestName} — at-risk of a silent unhappy checkout`,
      body: `Risk ${(a.riskScore * 100).toFixed(0)}%: ${a.delayedRequests} request${a.delayedRequests === 1 ? "" : "s"} past SLA, sentiment ${a.sentiment >= 0 ? "+" : ""}${a.sentiment.toFixed(2)}. Checkout in ${Math.round(a.minutesToCheckout / 60)}h from ${room?.number ?? a.roomId}.`,
      confidence: clamp(0.5 + (a.riskScore - RISK_THRESHOLD) * 1.2, 0, 0.88),
      basis: [
        `${a.delayedRequests} unresolved request${a.delayedRequests === 1 ? "" : "s"} past SLA`,
        `current sentiment ${a.sentiment.toFixed(2)}, weighted 55% of risk vs 45% request delay`,
        `guest value ₹${Math.round(a.guestValue).toLocaleString("en-IN")} so far this stay — sizes the suggested gesture`,
      ],
      impact: `Only 68% of service recoveries at upscale hotels land inside the guest's expected timeframe (525-hotel complaint study) — a timely gesture before checkout is the highest-leverage window to avoid a silent 2-star review.`,
      action: a.gesture,
      targetKind: "guest",
      targetId: a.guestId,
      createdAt: state.t,
      status: "pending",
      payload: { guestId: a.guestId, gesture: a.gesture, riskScore: a.riskScore },
    };
  });
}
