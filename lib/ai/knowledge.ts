import type { ResortModel } from "@/lib/architecture/types";
import { infoAnswers } from "@/lib/intelligence/concierge";

export interface KnowledgeDoc {
  id: string;
  text: string;
  /** File this fact actually lives in — shown in the UI so "trained on the data" is a
   * literal, checkable claim, not a marketing line. */
  source: string;
}

/** The resort's static knowledge corpus for the RAG concierge — built entirely from facts
 * that already exist elsewhere in this codebase (reused, not re-authored) plus the property's
 * own generated room mix. Rebuilt once per server process (see app/api/concierge/route.ts's
 * cache), since none of this changes at runtime — unlike guest-specific context, which is
 * injected directly per request, never retrieved. */
export function buildKnowledgeBase(model: ResortModel): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];

  for (const [keys, text] of infoAnswers) {
    docs.push({ id: `faq-${keys[0].replace(/\s+/g, "-")}`, text, source: "lib/intelligence/concierge.ts (infoAnswers)" });
  }

  const byType = new Map<string, number>();
  for (const r of model.rooms) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  const roomTypeNames: Record<string, string> = { standard: "Standard Room", deluxe: "Deluxe Room", suite: "Suite", accessible: "Accessible Room" };
  for (const [type, count] of byType) {
    docs.push({
      id: `room-type-${type}`,
      text: `${roomTypeNames[type] ?? type} — ${count} rooms at ${model.name}. ${type === "suite" ? "Suites include a separate living area and premium amenities." : type === "accessible" ? "Accessible rooms are step-free with a roll-in shower and widened doorways." : type === "deluxe" ? "Deluxe rooms are larger than Standard with upgraded views." : "Standard rooms are our base category, all with the same amenity set as every other room."}`,
      source: "lib/architecture (generated room mix)",
    });
  }

  docs.push({
    id: "loyalty-tiers",
    text: "Loyalty tiers are Silver, Gold and Platinum. Platinum and Gold members receive complimentary late checkout until 2pm where availability allows, and priority spa booking. Tier is based on total stays.",
    source: "lib/sim/types.ts (LoyaltyTier) + lib/intelligence/personalization.ts",
  });
  docs.push({
    id: "segments",
    text: "Guest segments are leisure couple, family, business, luxury and group, each with a different typical package: families get kids-eat-free dinner and connecting-room guarantees, business guests get flexible-cancellation corporate rates, luxury guests get suite upgrades and private sky bar tastings.",
    source: "lib/intelligence/segmentation.ts (cluster offers)",
  });
  docs.push({
    id: "privacy",
    text: "Guest preferences and spend history are only used for personalised offers with the guest's consent. A guest who has opted out is never profiled for marketing, only served generic, non-targeted assistance.",
    source: "lib/intelligence/personalization.ts (consentPersonalization gate)",
  });

  return docs;
}
