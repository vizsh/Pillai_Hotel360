import { NextResponse } from "next/server";
import { llmChat, llmStatus } from "@/lib/ai/llm";
import { buildClassifierPrompt, completeAnalysis, parseClassifierReply, type SignalAnalysis, type SignalInput } from "@/lib/ai/signalIntel";

/** Classifies public posts and headlines by traveller-impact intent. Model first (Nugen-aligned, Ollama or
 * hosted fallback); the rule-based classifier fills anything the model omits and is the whole answer when no
 * model is reachable. Results are cached per item set so the 20-minute signal poll does not re-bill the model. */
const cache = new Map<string, { at: number; analysis: Record<string, SignalAnalysis>; provider: string; model: string }>();
const TTL_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: SignalInput[] };
  const items = (body.items ?? []).filter((i) => i && typeof i.id === "string" && typeof i.title === "string").slice(0, 12);
  if (!items.length) return NextResponse.json({ ok: true, analysis: {}, provider: "none", model: "" });

  const key = items.map((i) => i.id).join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ ok: true, analysis: hit.analysis, provider: hit.provider, model: hit.model, cached: true });

  let fromModel: Record<string, SignalAnalysis> = {};
  let provider = "rules";
  let model = "rule-based classifier";
  const status = await llmStatus();
  if (status.provider !== "none") {
    const reply = await llmChat(buildClassifierPrompt(items));
    if (reply?.content) {
      fromModel = parseClassifierReply(reply.content, items);
      if (Object.keys(fromModel).length) {
        provider = reply.provider;
        model = reply.model;
      }
    }
  }
  const analysis = completeAnalysis(items, fromModel);
  cache.set(key, { at: Date.now(), analysis, provider, model });
  return NextResponse.json({ ok: true, analysis, provider, model, cached: false });
}
