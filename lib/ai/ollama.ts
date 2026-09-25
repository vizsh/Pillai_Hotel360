/** Thin client for a locally-run Ollama server — no API key, no outbound network call
 * beyond localhost, matching this project's edge/on-prem privacy stance (README: "Local-first
 * capable. Core AI can run on a single on-premises machine using open-weight models, for
 * resorts with poor connectivity" is the blueprint's own framing; this is that, built).
 * Every function here fails soft (returns null / false) instead of throwing — the concierge
 * must degrade to the deterministic classifier, never crash the chat, when Ollama isn't
 * running or a model isn't pulled. Timeouts are enforced via fetch's own AbortSignal.timeout,
 * not a hand-rolled wrapper — Node's fetch honors it directly. */

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
export const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "llama3.1:8b";
export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

const HEALTH_TIMEOUT_MS = 3000;
/** Local CPU inference is genuinely slow on modest hardware — measured ~31s for a single
 * embedding call on the dev machine this was built on, before the model was warm. Generous
 * on purpose so a real answer isn't cut off mid-generation on a cold request; the route's
 * module-load pre-warm (app/api/concierge/route.ts) means most real user messages hit an
 * already-loaded model and come back far faster than this ceiling. */
const CHAT_TIMEOUT_MS = 90000;
const EMBED_TIMEOUT_MS = 60000;

export interface OllamaStatus {
  reachable: boolean;
  chatModelPulled: boolean;
  embedModelPulled: boolean;
  models: string[];
}

/** Single round-trip that answers "is Ollama up, and are the two models this feature needs
 * actually pulled" — the concierge UI uses this to show an honest status instead of only
 * discovering a missing model on the first failed chat request. */
export async function ollamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return { reachable: false, chatModelPulled: false, embedModelPulled: false, models: [] };
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    return {
      reachable: true,
      chatModelPulled: models.some((m) => m === OLLAMA_CHAT_MODEL || m.startsWith(`${OLLAMA_CHAT_MODEL}:`)),
      embedModelPulled: models.some((m) => m === OLLAMA_EMBED_MODEL || m.startsWith(`${OLLAMA_EMBED_MODEL}:`)),
      models,
    };
  } catch {
    return { reachable: false, chatModelPulled: false, embedModelPulled: false, models: [] };
  }
}

export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(messages: ChatTurn[]): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_CHAT_MODEL, messages, stream: false, options: { temperature: 0.4 } }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
