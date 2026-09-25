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

/** Builds the system prompt: persona + guardrail instructions + retrieved resort knowledge +
 * the guest's own context (consent-gated). Guest-specific facts are injected directly, never
 * retrieved — RAG is for the static knowledge corpus (lib/ai/knowledge.ts), not for "what
 * room is this guest in," which the server already knows for certain. */
export function buildSystemPrompt(guest: GuestPromptContext | null, retrieved: RetrievedDoc[]): string {
  const lines: string[] = [
    "You are the AI concierge at Azure Bay Resort, speaking directly to a guest in a chat window.",
    "Be warm, concise (2-4 sentences), and specific. Never invent facts about the resort — only use the RESORT KNOWLEDGE below.",
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
