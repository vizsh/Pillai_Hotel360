import type { ResortModel } from "@/lib/architecture/types";
import type { Guest, Recommendation, SimState } from "@/lib/sim/types";
import { DAY, HOUR } from "@/lib/sim/seed";
import { clamp } from "@/lib/utils";

export interface NextBestAction {
  id: string;
  label: string;
  score: number;
  reason: string;
  cost: number;
  uplift: number;
}

export function nextBestActions(g: Guest, state: SimState, model: ResortModel): NextBestAction[] {
  const stayLen = (g.checkOut - g.checkIn) / DAY;
  const elapsed = (state.t - g.checkIn) / DAY;
  const stage = elapsed < 0.5 ? "arrival" : elapsed > stayLen - 1 ? "departure" : "mid-stay";
  const hour = (state.t % DAY) / HOUR;
  const room = g.roomId ? model.roomById.get(g.roomId) : null;
  const actions: NextBestAction[] = [];
  const add = (id: string, label: string, score: number, reason: string, cost: number, uplift: number) => actions.push({ id, label, score: clamp(score, 0, 1), reason, cost, uplift });

  if (g.sentiment < -0.2) add("recovery", "Service recovery: manager call + F&B credit ₹1,500", 0.9 + (g.loyalty !== "none" ? 0.08 : 0), `sentiment ${g.sentiment.toFixed(2)}${g.loyalty !== "none" ? `, ${g.loyalty} member` : ""}`, 1500, 0.35);
  if (g.prefs.includes("spa") && g.spendSpa === 0) add("spa", "Offer 20% spa credit for tomorrow morning", 0.62 + (g.segment === "luxury" ? 0.15 : 0), "spa preference on profile, no spa spend yet", 600, 0.22);
  if (g.prefs.includes("sea-view") && room && !room.seaView) add("upgrade", "Complimentary sea-view move (inventory available)", Object.values(state.rooms).some((r) => r.status === "vacant-clean" && model.roomById.get(r.id)!.seaView) ? 0.78 : 0.2, "sea-view preference unmet in current room", 0, 0.3);
  if (stage === "arrival" && g.vip) add("vip-welcome", "VIP welcome: champagne + GM note", 0.85, "VIP arrival stage", 2200, 0.2);
  if (stage === "arrival" && g.segment === "family" && !g.prefs.includes("crib")) add("kids", "Send kids club schedule + pool cabana offer", 0.55, "family segment on arrival", 0, 0.12);
  if (stage === "mid-stay" && hour >= 16 && hour <= 19) add("dinner", "Sky bar sunset table, 15% off for in-house", 0.5 + (g.segment === "leisure-couple" ? 0.2 : 0), "mid-stay, sunset window", 300, 0.15);
  if (stage === "departure" && g.sentiment > 0.3) add("rebook", "Rebook offer: 12% off next stay, valid 6 months", 0.7 + (g.loyalty === "none" ? 0.1 : 0), "positive sentiment near departure", 0, 0.28);
  if (stage === "departure" && g.prefs.includes("late-checkout")) add("late-co", "Confirm complimentary 2pm checkout", 0.66, "late-checkout preference, departure stage", 0, 0.1);
  if (g.prefs.includes("airport-transfer") && stage === "departure") add("transfer", "Pre-arrange airport transfer, confirm time", 0.6, "transfer preference, departure stage", 0, 0.08);
  if (g.segment === "business" && stage === "mid-stay") add("workspace", "Offer conference lounge access + early breakfast", 0.48, "business segment mid-stay", 0, 0.1);
  if (!actions.length) add("check", "Courtesy check-in call from front desk", 0.3, "no strong signals; maintain engagement", 0, 0.05);
  return actions.sort((a, b) => b.score - a.score).slice(0, 4);
}

export function personalizationRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const out: Recommendation[] = [];
  const guests = Object.values(state.guests).filter((g) => g.roomId);
  const scored = guests
    .map((g) => ({ g, nba: nextBestActions(g, state, model)[0] }))
    .filter((x) => x.nba.score >= 0.75)
    .sort((a, b) => b.nba.score - a.nba.score)
    .slice(0, 3);
  for (const { g, nba } of scored) {
    out.push({
      id: `rec-nba-${g.id}-${nba.id}`,
      module: "personalization",
      title: `${g.name} · ${model.roomById.get(g.roomId!)!.number}: ${nba.label}`,
      body: `Next-best-action scored ${nba.score.toFixed(2)} for this guest (${g.segment.replace("-", " ")}, ${g.loyalty} tier).`,
      confidence: nba.score * 0.92,
      basis: [nba.reason, `preferences: ${g.prefs.join(", ")}`, `stay stage from check-in/out timestamps`],
      impact: `Est. sentiment uplift +${nba.uplift.toFixed(2)} at ₹${nba.cost.toLocaleString("en-IN")} cost.`,
      action: nba.label,
      targetKind: "guest",
      targetId: g.id,
      createdAt: state.t,
      status: "pending",
      payload: { guestId: g.id, actionId: nba.id, uplift: nba.uplift },
    });
  }
  return out;
}
