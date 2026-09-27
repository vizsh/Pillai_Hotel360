import { chatRaw as ollamaChatRaw, ollamaStatus, embed, OLLAMA_CHAT_MODEL, type ChatTurn, type OllamaChatMessage, type OllamaStatus } from "./ollama";

/** One chat interface for every assistant in the app. Provider order:
 *   1. Nugen — the domain-ALIGNED model (base model -> Nugen alignment -> domain model), used whenever
 *      NUGEN_API_KEY and NUGEN_MODEL_ID are set (scripts/nugen/align.ts writes both into .env.local).
 *   2. Ollama — local fallback (llama3.1:8b), used when Nugen is unconfigured, unreachable or errors.
 * Each call reports which provider actually answered, so the UI can say so honestly. */
export type Provider = "nugen" | "ollama";

const NUGEN_BASE = process.env.NUGEN_BASE_URL ?? "https://api.nugen.in";
const NUGEN_TIMEOUT_MS = 45000;
const NUGEN_STATUS_TTL_MS = 60000;

export const nugenKey = () => process.env.NUGEN_API_KEY ?? "";
export const nugenModelId = () => process.env.NUGEN_MODEL_ID ?? "";
export const nugenConfigured = () => Boolean(nugenKey() && nugenModelId());

export interface LlmResult extends OllamaChatMessage {
  provider: Provider;
  model: string;
}

/** Nugen's chat schema only knows system/user/assistant, so tool results are folded into a user turn. */
export function toNugenMessages(messages: ChatTurn[]): { role: "system" | "user" | "assistant"; content: string }[] {
  return messages.map((m) => (m.role === "tool" ? { role: "user" as const, content: `[tool result]\n${m.content}` } : { role: m.role, content: m.content }));
}

interface NugenChoice {
  message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string | Record<string, unknown> } }[] };
}

/** Circuit breaker: after a Nugen failure, skip it for a short while so every guest message
 * does not pay the timeout before falling back to Ollama. */
let nugenDownUntil = 0;

async function nugenChat(messages: ChatTurn[], tools?: readonly unknown[]): Promise<LlmResult | null> {
  if (!nugenConfigured() || Date.now() < nugenDownUntil) return null;
  try {
    const res = await fetch(`${NUGEN_BASE}/api/v3/inference/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${nugenKey()}` },
      body: JSON.stringify({ model: nugenModelId(), messages: toNugenMessages(messages), temperature: 0.2, max_tokens: 900, ...(tools ? { tools, tool_choice: "auto" } : {}) }),
      signal: AbortSignal.timeout(NUGEN_TIMEOUT_MS),
    });
    if (!res.ok) {
      nugenDownUntil = Date.now() + NUGEN_STATUS_TTL_MS;
      return null;
    }
    const data = (await res.json()) as { choices?: NugenChoice[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) return null;
    const tool_calls = (msg.tool_calls ?? [])
      .filter((t) => t.function?.name)
      .map((t) => {
        let args: Record<string, unknown> = {};
        try {
          args = typeof t.function!.arguments === "string" ? JSON.parse(t.function!.arguments || "{}") : (t.function!.arguments ?? {});
        } catch {
          args = {};
        }
        return { function: { name: t.function!.name!, arguments: args } };
      });
    const content = (msg.content ?? "").trim();
    if (!content && !tool_calls.length) return null;
    return { content, tool_calls: tool_calls.length ? tool_calls : undefined, provider: "nugen", model: nugenModelId() };
  } catch {
    nugenDownUntil = Date.now() + NUGEN_STATUS_TTL_MS;
    return null;
  }
}

/** Chat with tool support. Nugen first (if configured), Ollama as the automatic fallback. */
export async function llmChat(messages: ChatTurn[], tools?: readonly unknown[]): Promise<LlmResult | null> {
  const viaNugen = await nugenChat(messages, tools);
  if (viaNugen) return viaNugen;
  const viaOllama = await ollamaChatRaw(messages, tools);
  return viaOllama ? { ...viaOllama, provider: "ollama", model: OLLAMA_CHAT_MODEL } : null;
}

export interface LlmStatus extends OllamaStatus {
  /** What will answer the next message: nugen if configured, else ollama, else none. */
  provider: Provider | "none";
  nugen: { configured: boolean; modelId: string | null; reachable: boolean | null };
  fallback: { provider: "ollama"; model: string; ready: boolean };
}

let nugenProbe: { at: number; ok: boolean } | null = null;

async function probeNugen(): Promise<boolean | null> {
  if (!nugenConfigured()) return null;
  if (nugenProbe && Date.now() - nugenProbe.at < NUGEN_STATUS_TTL_MS) return nugenProbe.ok;
  try {
    const res = await fetch(`${NUGEN_BASE}/api/v3/models/${encodeURIComponent(nugenModelId())}`, { headers: { Authorization: `Bearer ${nugenKey()}` }, signal: AbortSignal.timeout(5000) });
    nugenProbe = { at: Date.now(), ok: res.ok };
  } catch {
    nugenProbe = { at: Date.now(), ok: false };
  }
  if (nugenProbe.ok) nugenDownUntil = 0;
  return nugenProbe.ok;
}

/** Same shape the existing UI already reads from Ollama (reachable / chatModelPulled / embedModelPulled),
 * where "reachable" now means "some provider can answer", plus which provider that is. */
export async function llmStatus(): Promise<LlmStatus> {
  const [ollama, nugenOk] = await Promise.all([ollamaStatus(), probeNugen()]);
  const ollamaReady = ollama.reachable && ollama.chatModelPulled;
  const nugenUsable = nugenOk === true && Date.now() >= nugenDownUntil;
  return {
    ...ollama,
    reachable: ollama.reachable || nugenUsable,
    chatModelPulled: ollama.chatModelPulled || nugenUsable,
    provider: nugenUsable ? "nugen" : ollamaReady ? "ollama" : "none",
    nugen: { configured: nugenConfigured(), modelId: nugenConfigured() ? nugenModelId() : null, reachable: nugenOk },
    fallback: { provider: "ollama", model: OLLAMA_CHAT_MODEL, ready: ollamaReady },
  };
}

export { embed };
