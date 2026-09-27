import type { ChatTurn } from "./ollama";

/** Reads what travellers and news are actually saying about the weather event: each public post or
 * headline is classified into a traveller-impact intent, urgency and place. The aligned model (Nugen) does
 * this when available; a transparent rule-based classifier is the deterministic fallback and also fills
 * any item the model leaves out, so the feature never disappears with a provider. */
export type SignalIntent = "cancellation" | "delay-disruption" | "flooding" | "safety-warning" | "advisory" | "demand-shift" | "positive" | "irrelevant";

export const INTENTS: SignalIntent[] = ["cancellation", "delay-disruption", "flooding", "safety-warning", "advisory", "demand-shift", "positive", "irrelevant"];

export interface SignalAnalysis {
  intent: SignalIntent;
  urgency: number;
  location: string | null;
  summary: string;
  by: "model" | "rules";
}

export interface SignalInput {
  id: string;
  title: string;
  source: string;
}

const RULES: { intent: SignalIntent; urgency: number; re: RegExp }[] = [
  { intent: "safety-warning", urgency: 0.95, re: /\b(evacuat|red alert|orange alert|cyclone warning|landslide|drown|dead|killed|casualt|danger)/i },
  { intent: "flooding", urgency: 0.85, re: /\b(flood|waterlog|inundat|submerged|overflow)/i },
  { intent: "cancellation", urgency: 0.8, re: /\b(cancel|called off|postponed|refund|no.?show|abandon(ed)? (trip|plan))/i },
  { intent: "delay-disruption", urgency: 0.7, re: /\b(delay|diverted|grounded|closed|closure|suspend|disrupt|stranded|blocked|shut)/i },
  { intent: "advisory", urgency: 0.55, re: /\b(imd|forecast|advisory|alert|warning|expected to|heavy rain|depression|cyclone|low pressure|monsoon)/i },
  { intent: "demand-shift", urgency: 0.4, re: /\b(indoor|staycation|rebook|extend(ed)? stay|last.minute|tourist(s)? (flock|throng)|footfall)/i },
  { intent: "positive", urgency: 0.1, re: /\b(enjoy|beautiful|lovely|great weather|clear skies|sunny|pleasant)/i },
];

const PLACES = ["Goa", "Panjim", "Panaji", "Mumbai", "Pune", "Konkan", "Kerala", "Karnataka", "Maharashtra", "Odisha", "Andhra", "Bengaluru", "Chennai", "Kolkata", "Delhi", "Mangaluru", "Kochi", "Dabolim", "Mopa", "Ratnagiri", "Sindhudurg", "Arabian Sea", "Bay of Bengal"];

export function extractLocation(text: string): string | null {
  const found = PLACES.find((p) => new RegExp(`\\b${p}\\b`, "i").test(text));
  return found ?? null;
}

export function ruleClassify(title: string): SignalAnalysis {
  const hit = RULES.find((r) => r.re.test(title));
  const relevant = /\b(rain|storm|cyclone|monsoon|flood|weather|heat|wind|flight|airport|road|beach|tourist|travel|trip|goa)/i.test(title);
  const intent: SignalIntent = hit ? hit.intent : relevant ? "advisory" : "irrelevant";
  return { intent, urgency: hit ? hit.urgency : relevant ? 0.3 : 0, location: extractLocation(title), summary: title.length > 90 ? title.slice(0, 87) + "…" : title, by: "rules" };
}

export function buildClassifierPrompt(items: SignalInput[]): ChatTurn[] {
  return [
    {
      role: "system",
      content: `You classify public posts and headlines about a weather event for a resort's digital twin. For EACH numbered item return one object. Reply with ONLY a JSON array, no prose.
Fields: "i" (the item number), "intent" (one of ${INTENTS.join(" | ")}), "urgency" (0 to 1, how much it should change a resort's operations), "location" (place named in the text or null), "summary" (at most 12 words).
Intent meanings: cancellation = travellers cancelling or postponing; delay-disruption = flights, roads or services delayed or closed; flooding = water on roads, waterlogging; safety-warning = evacuation, red alert, danger to people; advisory = official forecast or warning; demand-shift = guests changing plans, staying indoors, rebooking; positive = good weather or enjoyment; irrelevant = not about weather impact on travel.`,
    },
    { role: "user", content: items.map((it, n) => `${n + 1}. [${it.source}] ${it.title}`).join("\n") },
  ];
}

export function parseClassifierReply(reply: string, items: SignalInput[]): Record<string, SignalAnalysis> {
  const out: Record<string, SignalAnalysis> = {};
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return out;
  let arr: unknown;
  try {
    arr = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const row of arr as Record<string, unknown>[]) {
    const idx = Number(row.i) - 1;
    const item = items[idx];
    if (!item || !INTENTS.includes(row.intent as SignalIntent)) continue;
    const urgency = Math.max(0, Math.min(1, Number(row.urgency)));
    out[item.id] = {
      intent: row.intent as SignalIntent,
      urgency: Number.isFinite(urgency) ? urgency : 0.3,
      location: typeof row.location === "string" && row.location.trim() ? row.location.trim() : extractLocation(item.title),
      summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.trim().slice(0, 120) : item.title.slice(0, 90),
      by: "model",
    };
  }
  return out;
}

/** Merge model output with the rule classifier so every item always has an analysis. */
export function completeAnalysis(items: SignalInput[], fromModel: Record<string, SignalAnalysis>): Record<string, SignalAnalysis> {
  const out: Record<string, SignalAnalysis> = {};
  for (const it of items) out[it.id] = fromModel[it.id] ?? ruleClassify(it.title);
  return out;
}

const DISRUPTIVE: SignalIntent[] = ["cancellation", "delay-disruption", "flooding", "safety-warning"];

/** 0-1: urgency-weighted share of items that describe real traveller disruption (not just a forecast). */
export function disruptionScoreOf(analysis: SignalAnalysis[]): number {
  const relevant = analysis.filter((a) => a.intent !== "irrelevant");
  if (!relevant.length) return 0;
  const weighted = relevant.filter((a) => DISRUPTIVE.includes(a.intent)).reduce((s, a) => s + a.urgency, 0);
  return Math.max(0, Math.min(1, weighted / relevant.length));
}
