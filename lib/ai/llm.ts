import { chatRaw as ollamaChatRaw, ollamaStatus, embed, OLLAMA_CHAT_MODEL, type ChatTurn, type OllamaChatMessage, type OllamaStatus } from "./ollama";

/** One chat interface for every assistant in the app. Provider order:
 *   1. Nugen — the domain-ALIGNED model (base model -> Nugen alignment -> domain model), used whenever
 *      NUGEN_API_KEY and NUGEN_MODEL_ID are set (scripts/nugen/align.ts writes both into .env.local).
 *   2. Ollama — local fallback (llama3.1:8b), used when Nugen is unconfigured, unreachable or errors.
 *   3. Hosted — optional cloud fallback for deployments where Ollama cannot run (Vercel etc.): Anthropic when
 *      ANTHROPIC_API_KEY is set, or any OpenAI-compatible endpoint via HOSTED_LLM_BASE_URL / _API_KEY / _MODEL.
 *      With none of these reachable the assistants fall back to templated answers from live data (no model).
 * Each call reports which provider actually answered, so the UI can say so honestly. */
export type Provider = "nugen" | "ollama" | "hosted";

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
    const content = (msg.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!content && !tool_calls.length) return null;
    return { content, tool_calls: tool_calls.length ? tool_calls : undefined, provider: "nugen", model: nugenModelId() };
  } catch {
    nugenDownUntil = Date.now() + NUGEN_STATUS_TTL_MS;
    return null;
  }
}

export const hostedConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || (process.env.HOSTED_LLM_API_KEY && process.env.HOSTED_LLM_MODEL));
export const hostedLabel = () => (process.env.ANTHROPIC_API_KEY ? (process.env.HOSTED_LLM_MODEL ?? "claude-haiku-4-5-20251001") : (process.env.HOSTED_LLM_MODEL ?? ""));
let hostedDownUntil = 0;

/** Plain text-in/text-out cloud fallback (no tool calling: routing pre-fetches the data anyway). */
async function hostedChat(messages: ChatTurn[]): Promise<LlmResult | null> {
  if (!hostedConfigured() || Date.now() < hostedDownUntil) return null;
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const convo = toNugenMessages(messages.filter((m) => m.role !== "system"));
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const model = hostedLabel();
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 900, temperature: 0.2, system, messages: convo.length ? convo : [{ role: "user", content: "Hello" }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { content?: { text?: string }[] };
      const content = data.content?.[0]?.text?.trim();
      return content ? { content, provider: "hosted", model } : null;
    }
    const base = (process.env.HOSTED_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.HOSTED_LLM_MODEL!;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.HOSTED_LLM_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 900, messages: [{ role: "system", content: system }, ...convo] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return content ? { content, provider: "hosted", model } : null;
  } catch {
    hostedDownUntil = Date.now() + NUGEN_STATUS_TTL_MS;
    return null;
  }
}

/** Chat with tool support. Nugen first, Ollama as the automatic fallback, then the optional hosted model. */
export async function llmChat(messages: ChatTurn[], tools?: readonly unknown[]): Promise<LlmResult | null> {
  const viaNugen = await nugenChat(messages, tools);
  if (viaNugen) return viaNugen;
  const viaOllama = await ollamaChatRaw(messages, tools);
  if (viaOllama) return { ...viaOllama, provider: "ollama", model: OLLAMA_CHAT_MODEL };
  return hostedChat(messages);
}

export interface LlmStatus extends OllamaStatus {
  /** What will answer the next message: nugen if configured, else ollama, else none. */
  provider: Provider | "none";
  hosted: { configured: boolean; model: string | null };
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
    reachable: ollama.reachable || nugenUsable || hostedConfigured(),
    chatModelPulled: ollama.chatModelPulled || nugenUsable || hostedConfigured(),
    provider: nugenUsable ? "nugen" : ollamaReady ? "ollama" : hostedConfigured() ? "hosted" : "none",
    hosted: { configured: hostedConfigured(), model: hostedConfigured() ? hostedLabel() : null },
    nugen: { configured: nugenConfigured(), modelId: nugenConfigured() ? nugenModelId() : null, reachable: nugenOk },
    fallback: { provider: "ollama", model: OLLAMA_CHAT_MODEL, ready: ollamaReady },
  };
}

export { embed };
