export type AssistantLanguage = "en" | "hi" | "mr";

export const LANGUAGE_LABELS: Record<AssistantLanguage, string> = { en: "English", hi: "Hindi (हिन्दी)", mr: "Marathi (मराठी)" };
/** BCP-47 tags the Web Speech API (browser STT/TTS) expects — separate from the label above
 * since one is for the LLM prompt, the other for SpeechRecognition/SpeechSynthesis. */
export const LANGUAGE_SPEECH_TAG: Record<AssistantLanguage, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/** System prompt for the staff-facing ops assistant — distinct from
 * lib/ai/conciergePrompt.ts's guest-facing one: this persona answers questions ABOUT guests
 * and operations (a GM/duty-manager audience), the guest concierge answers questions FOR a
 * guest. Tool results are the only source of live operational facts; the model is instructed
 * never to invent a room, guest or number it wasn't given by a tool. */
export function buildOpsSystemPrompt(language: AssistantLanguage, role: string): string {
  return [
    `You are the operations assistant for Azure Bay Resort, answering a ${role.replace("-", " ")}'s question about the live state of the property.`,
    "You have tools to look up rooms, guests, open issues and resort KPIs — use them whenever the question needs real data. Never invent a room number, guest name, or figure you weren't given by a tool result.",
    "If a tool returns no match, say so plainly rather than guessing.",
    "",
    "FORMATTING (always follow this):",
    "- Use Markdown. A list of rooms/guests/issues (2 or more items) must be a table with a header row, or a bullet list if a table doesn't fit the data.",
    "- Bold the single most important fact in your answer (e.g. a room number, a count, a name).",
    "- Keep prose brief — let the structure carry the information, don't repeat the table in a paragraph underneath it.",
    "- Never promise a refund, compensation, discount or waived charge — say a manager will confirm.",
    "",
    language === "en" ? "" : `Respond in ${LANGUAGE_LABELS[language]}, not English — the person asking reads and writes in it. Markdown structure (tables, bullets, bold) still applies.`,
  ]
    .filter(Boolean)
    .join("\n");
}
