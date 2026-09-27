import { NextResponse } from "next/server";
import type { ChatTurn } from "@/lib/ai/ollama";
import { llmChat, llmStatus } from "@/lib/ai/llm";
import { TOOL_SCHEMAS, executeTool, routeTools, precomputeMoney, precomputeUserMath, ungroundedFigures, type ToolCall } from "@/lib/ai/tools";
import type { OpsSnapshot } from "@/lib/ai/opsSnapshot";
import { buildOpsSystemPrompt, type AssistantLanguage } from "@/lib/ai/opsAssistantPrompt";
import { composeAnswer } from "@/lib/ai/composers";
import { offlineAnswer } from "@/lib/ai/offlineAnswer";
import { violatesGuardrails, GUARDRAIL_FALLBACK_REPLY } from "@/lib/ai/conciergePrompt";

const MAX_TOOL_CALLS = 5;
const TOOL_ROUNDS_WITH_SCHEMA = 3;

export async function GET() {
  return NextResponse.json(await llmStatus());
}

export async function POST(req: Request) {
  const body = await req.json();
  const { message, snapshot, language, history } = body as {
    message?: string;
    snapshot?: OpsSnapshot;
    language?: AssistantLanguage;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (typeof message !== "string" || !message.trim() || !snapshot) {
    return NextResponse.json({ ok: false, reason: "invalid-request" }, { status: 400 });
  }

  const lang: AssistantLanguage = language === "hi" || language === "mr" ? language : "en";
  // Exact-arithmetic question shapes are answered deterministically (lib/ai/composers.ts): a language model,
  // aligned or not, is never trusted with the sums, and a templated answer from measured numbers is the
  // project's own rule. These answers also work with every LLM provider offline.
  const composed = lang === "en" ? composeAnswer(message, snapshot) : null;
  if (composed) return NextResponse.json({ ok: true, reply: composed.reply, model: "deterministic composer", provider: "deterministic", guardrailTripped: false, toolsUsed: composed.toolsUsed, verified: true });

  const status = await llmStatus();
  const offline = () => {
    const o = offlineAnswer(message, snapshot);
    return o ? NextResponse.json({ ok: true, reply: o.reply, model: "templates", provider: "offline-templates", guardrailTripped: false, toolsUsed: o.toolsUsed, verified: true }) : null;
  };
  if (status.provider === "none") {
    return offline() ?? NextResponse.json({ ok: false, reason: "no-llm-available", nugen: status.nugen }, { status: 503 });
  }

  // Live data is pre-fetched by deterministic routing and injected into the prompt, so any provider
  // (Nugen-aligned or Ollama) answers from facts instead of having to choose and call tools itself.
  const toolsUsed: string[] = [];
  const prefetched: string[] = [];
  for (const call of routeTools(message, snapshot)) {
    const result = executeTool(call, snapshot);
    if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
    prefetched.push(`### ${call.name}\n${JSON.stringify(result).slice(0, 2200)}`);
  }
  const money = toolsUsed.includes("get_financials") ? precomputeMoney(message, snapshot) : null;
  if (money) prefetched.unshift(`### exact_percentage_arithmetic (verified, quote these)\n${money}`);
  const userMath = precomputeUserMath(message);
  if (userMath) prefetched.unshift(`### exact_arithmetic_on_the_users_own_figures (verified, quote these)\n${userMath}`);
  const systemPrompt =
    buildOpsSystemPrompt(lang, snapshot.role) +
    (prefetched.length
      ? `\n\nLIVE DATA ALREADY FETCHED FOR THIS QUESTION (authoritative — every figure you state must come from here or be a clearly labelled assumption):\n${prefetched.join("\n\n")}\nQuote the verified arithmetic lines rather than recomputing. If a needed input is not in this data (e.g. revenue by outlet is not tracked), say exactly what is missing, then use the closest measured figure as a labelled assumption — never invent a number or attribute one to a tool that did not return it.`
      : "");
  const messages: ChatTurn[] = [{ role: "system", content: systemPrompt }, ...(history ?? []).slice(-4), { role: "user", content: message }];

  // With data already injected no tool schemas are offered (keeps the prompt inside a small model's context);
  // when routing found nothing, the model may still call tools itself.
  const activeTools = prefetched.length ? undefined : TOOL_SCHEMAS;
  let provider: string = status.provider;
  let model = status.provider === "nugen" ? (status.nugen.modelId ?? "") : status.fallback.model;
  let rounds = 0;
  let finalContent: string | null = null;

  while (rounds < MAX_TOOL_CALLS) {
    const response = await llmChat(messages, rounds < TOOL_ROUNDS_WITH_SCHEMA ? activeTools : undefined);
    if (!response) break;
    provider = response.provider;
    model = response.model;

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: response.content ?? "" });
      for (const tc of response.tool_calls) {
        const call: ToolCall = { name: tc.function.name, arguments: tc.function.arguments ?? {} };
        if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
        messages.push({ role: "tool", content: JSON.stringify(executeTool(call, snapshot)) });
      }
      rounds++;
      continue;
    }

    finalContent = response.content ?? null;
    break;
  }

  if (!finalContent) return offline() ?? NextResponse.json({ ok: false, reason: "no-response" }, { status: 502 });

  // A model that answers with a raw tool-call blob instead of prose gets one nudge without tools.
  if (/^\s*\{\s*"name"\s*:/.test(finalContent)) {
    messages.push({ role: "assistant", content: finalContent });
    messages.push({ role: "user", content: "Answer in plain prose using the data already provided; do not output JSON." });
    const again = await llmChat(messages);
    if (again?.content) finalContent = again.content;
  }

  // Numeric grounding gate: any figure >= 1000 the model states must exist in the data it was given
  // (prefetched tools, later tool results, or the user's own message). One corrective retry; if it
  // still cites an unverified figure the reply says so instead of presenting it as fact.
  const sourceText = () => messages.map((m) => m.content).join("\n");
  let unverified = ungroundedFigures(finalContent, sourceText());
  if (unverified.length) {
    messages.push({ role: "assistant", content: finalContent });
    messages.push({ role: "user", content: `Your answer contains figures that are not in the data or tool results: ${unverified.map((n) => n.toLocaleString("en-IN")).join(", ")}. Rewrite it using ONLY figures from the data or given by the user. If an input is missing, say so and give the percentage effect instead of an invented rupee figure.` });
    const retry = await llmChat(messages);
    if (retry?.content) {
      finalContent = retry.content;
      provider = retry.provider;
      model = retry.model;
      unverified = ungroundedFigures(finalContent, sourceText());
    }
  }

  if (violatesGuardrails(finalContent)) {
    return NextResponse.json({ ok: true, reply: GUARDRAIL_FALLBACK_REPLY, model, provider, guardrailTripped: true, toolsUsed });
  }
  const cleaned = finalContent.replace(/^\s*_?Basis:.*$/gim, "").trim();
  const caveat = unverified.length ? `\n\n> Note: ${unverified.map((n) => n.toLocaleString("en-IN")).join(", ")} could not be verified against the live data — treat as an estimate.` : "";
  const reply = toolsUsed.length ? `${cleaned}${caveat}\n\n_Basis: ${toolsUsed.join(", ")}_` : `${cleaned}${caveat}`;
  return NextResponse.json({ ok: true, reply, model, provider, guardrailTripped: false, toolsUsed, verified: unverified.length === 0 });
}
