import { NextResponse } from "next/server";
import { getModel } from "@/lib/architecture/model";
import { buildKnowledgeBase, type KnowledgeDoc } from "@/lib/ai/knowledge";
import { chat, embed, OLLAMA_CHAT_MODEL, ollamaStatus } from "@/lib/ai/ollama";
import { buildSystemPrompt, correctTierEligibility, GUARDRAIL_FALLBACK_REPLY, violatesGuardrails, type GuestPromptContext } from "@/lib/ai/conciergePrompt";
import { retrieveTopK, type EmbeddedDoc } from "@/lib/ai/rag";

const TOP_K = 4;
/** Below this cosine similarity, a "retrieved" doc is noise, not a match — better to tell
 * the LLM nothing was found than hand it a barely-related fact to improvise around. */
const MIN_SCORE = 0.35;

/** Embeddings are computed once per server process and cached — the knowledge base is
 * static (derived from the resort's fixed config), so re-embedding it on every message would
 * be a real, avoidable Ollama round-trip per doc per request. */
let embeddedCache: EmbeddedDoc[] | null = null;
let embeddingInFlight: Promise<EmbeddedDoc[]> | null = null;

async function getEmbeddedKnowledgeBase(): Promise<EmbeddedDoc[]> {
  if (embeddedCache) return embeddedCache;
  if (embeddingInFlight) return embeddingInFlight;
  embeddingInFlight = (async () => {
    const docs: KnowledgeDoc[] = buildKnowledgeBase(getModel());
    // Fire every doc's embedding request concurrently rather than one at a time — this is
    // the one-time cost per server process (cached after), but a dozen sequential round-trips
    // to Ollama adds real seconds to the guest's very first message for no reason.
    const vectors = await Promise.all(docs.map((d) => embed(d.text)));
    const out: EmbeddedDoc[] = docs.map((d, i) => ({ ...d, embedding: vectors[i]! })).filter((d) => d.embedding);
    embeddedCache = out;
    embeddingInFlight = null;
    return out;
  })();
  return embeddingInFlight;
}

// Fire-and-forget pre-warm at module load, not on the first request: local CPU inference
// measured ~30s for a single embedding call on modest hardware during this session's own
// testing, and Ollama loads a model into memory on its first use per process. Without this,
// the very first guest message would pay both costs (KB embedding + model load) serially,
// which reads as "broken," not "slow." A dummy chat call forces the chat model to load; the
// KB embedding warms itself via getEmbeddedKnowledgeBase(). Both are safe no-ops if Ollama
// isn't running — they fail soft like every other call in lib/ai/ollama.ts.
void getEmbeddedKnowledgeBase();
void chat([{ role: "user", content: "Reply with OK." }]);

export async function GET() {
  const status = await ollamaStatus();
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { message, guest } = body as { message?: string; guest?: GuestPromptContext | null };
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false, reason: "invalid-request" }, { status: 400 });
  }

  const status = await ollamaStatus();
  if (!status.reachable) return NextResponse.json({ ok: false, reason: "ollama-unreachable" }, { status: 503 });
  if (!status.chatModelPulled) return NextResponse.json({ ok: false, reason: "chat-model-missing", model: OLLAMA_CHAT_MODEL }, { status: 503 });

  const queryEmbedding = status.embedModelPulled ? await embed(message) : null;
  const knowledgeBase = status.embedModelPulled ? await getEmbeddedKnowledgeBase() : [];
  const retrieved = queryEmbedding && knowledgeBase.length ? retrieveTopK(queryEmbedding, knowledgeBase, TOP_K).filter((d) => d.score >= MIN_SCORE) : [];

  const systemPrompt = buildSystemPrompt(guest ?? null, retrieved);
  const reply = await chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ]);
  if (!reply) return NextResponse.json({ ok: false, reason: "no-response" }, { status: 502 });

  if (violatesGuardrails(reply)) {
    return NextResponse.json({ ok: true, reply: GUARDRAIL_FALLBACK_REPLY, model: OLLAMA_CHAT_MODEL, guardrailTripped: true, retrievedCount: retrieved.length });
  }

  const tierCorrected = correctTierEligibility(reply, guest ?? null);
  if (tierCorrected) {
    return NextResponse.json({ ok: true, reply: tierCorrected, model: OLLAMA_CHAT_MODEL, guardrailTripped: true, retrievedCount: retrieved.length });
  }

  return NextResponse.json({ ok: true, reply, model: OLLAMA_CHAT_MODEL, guardrailTripped: false, retrievedCount: retrieved.length });
}
