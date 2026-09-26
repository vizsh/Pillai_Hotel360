import type { RetrievedDoc } from "./rag";

export interface GuestPromptContext {
  name: string;
  roomNumber: string;
  segment: string;
  loyalty: string;
  vip: boolean;
  /** Only populated when the guest has consented to preference-driven personalization —
   * mirrors lib/intelligence/personalization.ts's own consent gate exactly, so the LLM never
   * sees a profile the rest of the system wouldn't use either. */
  prefs: string[] | null;
}

/** Anything the LLM's reply must never say, checked after generation — a system-prompt
 * instruction alone is a request an LLM can ignore, not a guarantee; this is the deterministic
 * backstop the blueprint's own "guardrails prevent the bot from promising refunds or
 * unapproved discounts" ask actually requires. Tripping this never blocks the guest's
 * message — lib/intelligence/concierge.ts's deterministic classifier has already created
 * whatever task the message warranted; only the LLM's supplementary reply is swapped out. */
const FORBIDDEN_PATTERNS: RegExp[] = [/\brefund/i, /compensat\w*/i, /\bwaive/i, /free upgrade/i, /complimentary night/i, /\bdiscount/i, /money back/i];

export function violatesGuardrails(reply: string): boolean {
  return FORBIDDEN_PATTERNS.some((p) => p.test(reply));
}

export const GUARDRAIL_FALLBACK_REPLY = "That's a request I'd want a manager to confirm directly rather than promise here — I've flagged it for the front desk to follow up with you.";

/** A second, narrower guardrail category, distinct from FORBIDDEN_PATTERNS above: not "never
 * say this," but "never say this to a guest who doesn't qualify." Verified live during this
 * project's own testing that the LLM will confidently tell a Silver-tier guest they get a
 * Gold/Platinum-exclusive benefit — the retrieved knowledge stated the correct tier gate, the
 * model just didn't check the guest's own tier against it. A regex guardrail can't verify
 * arbitrary facts, but tier-gated benefits are a small, fixed, enumerable set (they're
 * authored once in lib/ai/knowledge.ts), so this list is kept in lockstep with that file's
 * "loyalty-tiers" doc by hand — if that doc's tiering ever changes, update eligibleTiers here
 * too. Tripping this never blocks the reply outright like FORBIDDEN_PATTERNS does; it swaps in
 * a reply that states the real, tier-correct answer, because unlike a refund promise (where any
 * answer we could give is a business decision we don't want an LLM making), the correct answer
 * here is fully known and deterministic — there's no reason to fall back to a deflection. */
interface TierGatedBenefit {
  pattern: RegExp;
  eligibleTiers: readonly string[];
  correctReplyFor: (tier: string, name: string) => string;
}

const TIER_GATED_BENEFITS: readonly TierGatedBenefit[] = [
  {
    pattern: /complimentary late check[\s-]?out|late check[\s-]?out (?:until|till|by) (?:2\s?\s?p\.?m\.?|14:?00)/i,
    eligibleTiers: ["gold", "platinum"],
    correctReplyFor: (tier, name) =>
      tier === "gold" || tier === "platinum"
        ? `Yes — as a ${tier === "gold" ? "Gold" : "Platinum"} member, ${name} has complimentary late checkout until 2pm, subject to availability.`
        : `Complimentary late checkout until 2pm is reserved for our Gold and Platinum members, so it isn't included at ${name}'s current loyalty tier. Standard checkout is 11:00, but I'm happy to check with the front desk whether a later checkout can still be arranged.`,
  },
  {
    pattern: /priority spa booking/i,
    eligibleTiers: ["gold", "platinum"],
    correctReplyFor: (tier, name) =>
      tier === "gold" || tier === "platinum"
        ? `Yes — ${name} has priority spa booking as a ${tier === "gold" ? "Gold" : "Platinum"} member.`
        : `Priority spa booking is one of our Gold and Platinum benefits, so it isn't included at ${name}'s current tier — I can still help book a regular spa slot.`,
  },
];

/** Returns a corrected reply when the LLM's answer asserts a tier-gated benefit the guest's
 * own tier doesn't qualify for, or null when nothing here applies (the overwhelming majority
 * of replies — this only fires for the small, named set of benefits above). */
export function correctTierEligibility(reply: string, guest: GuestPromptContext | null): string | null {
  if (!guest) return null;
  const tier = guest.loyalty.toLowerCase();
  for (const benefit of TIER_GATED_BENEFITS) {
    if (benefit.pattern.test(reply) && !benefit.eligibleTiers.includes(tier)) {
      return benefit.correctReplyFor(tier, guest.name);
    }
  }
  return null;
}

/** Builds the system prompt: persona + guardrail instructions + retrieved resort knowledge +
 * the guest's own context (consent-gated). Guest-specific facts are injected directly, never
 * retrieved — RAG is for the static knowledge corpus (lib/ai/knowledge.ts), not for "what
 * room is this guest in," which the server already knows for certain. */
export function buildSystemPrompt(guest: GuestPromptContext | null, retrieved: RetrievedDoc[]): string {
  const lines: string[] = [
    "You are the AI concierge at Azure Bay Resort, speaking directly to a guest in a chat window.",
    "Be warm and specific. Default to 2-4 sentences; if the guest's message has multiple distinct questions, answer each one as its own short sentence or dash-prefixed line rather than compressing them into one — a guest who asked three things should be able to see three answers.",
    "Never invent facts about the resort — only use the RESORT KNOWLEDGE below, and never state a number, time, or policy that isn't written there.",
    "Some benefits in RESORT KNOWLEDGE are restricted to specific loyalty tiers. Before telling this guest they have a tier-restricted benefit, check it against GUEST CONTEXT's actual loyalty tier below. If their tier doesn't match, say plainly that it's reserved for other tiers rather than implying they have it.",
    "Never promise a refund, compensation, discount, free upgrade or waived charge — for those, say you'll have a manager confirm and follow up.",
    "If the guest asks something the RESORT KNOWLEDGE doesn't cover, say so plainly and offer to connect them with the right team, rather than guessing.",
  ];

  if (guest) {
    lines.push("", "GUEST CONTEXT:", `Name: ${guest.name}. Room ${guest.roomNumber}. Segment: ${guest.segment}. Loyalty tier: ${guest.loyalty}.${guest.vip ? " VIP guest." : ""}`);
    lines.push(guest.prefs ? `Known preferences (consented): ${guest.prefs.join(", ")}.` : "This guest has not consented to preference-based personalization — do not reference any profile or preferences, respond generically.");
  }

  lines.push("", "RESORT KNOWLEDGE (only source of truth for resort facts):");
  if (retrieved.length === 0) lines.push("(no matching knowledge found for this question — say you're not sure and offer to check)");
  for (const d of retrieved) lines.push(`- ${d.text}`);

  return lines.join("\n");
}
