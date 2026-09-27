import { NextResponse } from "next/server";
import { chatRaw, ollamaStatus, OLLAMA_CHAT_MODEL, type ChatTurn } from "@/lib/ai/ollama";
import { TOOL_SCHEMAS, executeTool, suggestTools, precomputeMoney, precomputeUserMath, ungroundedFigures, type ToolCall } from "@/lib/ai/tools";
import type { OpsSnapshot } from "@/lib/ai/opsSnapshot";
import { buildOpsSystemPrompt, type AssistantLanguage } from "@/lib/ai/opsAssistantPrompt";
import { composeAnswer } from "@/lib/ai/composers";
import { violatesGuardrails, GUARDRAIL_FALLBACK_REPLY } from "@/lib/ai/conciergePrompt";

const MAX_TOOL_CALLS = 5;
const TOOL_ROUNDS_WITH_SCHEMA = 3;

export async function GET() {
  const status = await ollamaStatus();
  return NextResponse.json(status);
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
  // Exact-arithmetic question shapes are answered deterministically (lib/ai/composers.ts): a small local
  // model cannot be trusted to do the sums, and a templated answer from measured numbers is the project's own rule.
  const composed = lang === "en" ? composeAnswer(message, snapshot) : null;
  if (composed) return NextResponse.json({ ok: true, reply: composed.reply, model: "deterministic composer", guardrailTripped: false, toolsUsed: composed.toolsUsed, verified: true });

  const status = await ollamaStatus();
  if (!status.reachable) return NextResponse.json({ ok: false, reason: "ollama-unreachable" }, { status: 503 });
  if (!status.chatModelPulled) return NextResponse.json({ ok: false, reason: "chat-model-missing", model: OLLAMA_CHAT_MODEL }, { status: 503 });

  const hints = suggestTools(message);
  const toolsUsed: string[] = [];
  const prefetched: string[] = [];
  for (const name of hints) {
    if (name === "calculate") continue;
    const result = executeTool({ name, arguments: name === "search_knowledge" ? { query: message } : {} }, snapshot);
    toolsUsed.push(name);
    prefetched.push(`### ${name}
${JSON.stringify(result).slice(0, 2200)}`);
  }
  const money = hints.includes("get_financials") ? precomputeMoney(message, snapshot) : null;
  if (money) prefetched.unshift(`### exact_percentage_arithmetic (verified, quote these)
${money}`);
  const userMath = precomputeUserMath(message);
  if (userMath) prefetched.unshift(`### exact_arithmetic_on_the_users_own_figures (verified, quote these)
${userMath}`);
  const systemPrompt =
    buildOpsSystemPrompt(lang, snapshot.role) +
    (prefetched.length
      ? `

LIVE DATA ALREADY FETCHED FOR THIS QUESTION (authoritative — every figure you state must come from here, from a tool you call, or be a clearly labelled assumption):
${prefetched.join("\n\n")}
Use the calculate tool for arithmetic. If a needed input is not in this data (e.g. revenue by outlet is not tracked), say exactly what is missing, then use the closest measured figure as a labelled assumption — never invent a number or attribute one to a tool that did not return it.`
      : "");
  const messages: ChatTurn[] = [{ role: "system", content: systemPrompt }, ...(history ?? []).slice(-4), { role: "user", content: message }];

  // With the relevant data already injected, offering only calculate keeps the prompt inside the small
  // model's context window (13 tool schemas + data overflowed it) and stops it re-fetching or skipping data.
  const activeTools = prefetched.length ? undefined : TOOL_SCHEMAS;
  let rounds = 0;
  let finalContent: string | null = null;

  while (rounds < MAX_TOOL_CALLS) {
    const response = await chatRaw(messages, rounds < TOOL_ROUNDS_WITH_SCHEMA ? activeTools : undefined);
    if (!response) break;

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: response.content ?? "" });
      for (const tc of response.tool_calls) {
        const call: ToolCall = { name: tc.function.name, arguments: tc.function.arguments ?? {} };
        if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
        const result = executeTool(call, snapshot);
        messages.push({ role: "tool", content: JSON.stringify(result) });
      }
      rounds++;
      continue;
    }

    finalContent = response.content ?? null;
    break;
  }

  if (!finalContent) return NextResponse.json({ ok: false, reason: "no-response" }, { status: 502 });

  // Numeric grounding gate: any figure >= 1000 the model states must exist in the data it was given
  // (prefetched tools, later tool results, or the user's own message). One corrective retry; if it
  // still cites an unverified figure the reply says so instead of presenting it as fact.
  const sourceText = () => messages.map((m) => m.content).join("\n");
  let unverified = ungroundedFigures(finalContent, sourceText());
  if (unverified.length) {
    messages.push({ role: "assistant", content: finalContent });
    messages.push({ role: "user", content: `Your answer contains figures that are not in the data or tool results: ${unverified.map((n) => n.toLocaleString("en-IN")).join(", ")}. Rewrite it using ONLY figures from the data, from the calculate tool, or given by the user. If an input is missing, say so and give the percentage effect instead of an invented rupee figure.` });
    const retry = await chatRaw(messages, activeTools);
    let retried = retry?.content ?? null;
    if (retry?.tool_calls?.length) {
      messages.push({ role: "assistant", content: retry.content ?? "" });
      for (const tc of retry.tool_calls) {
        const call: ToolCall = { name: tc.function.name, arguments: tc.function.arguments ?? {} };
        if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
        messages.push({ role: "tool", content: JSON.stringify(executeTool(call, snapshot)) });
      }
      retried = (await chatRaw(messages))?.content ?? null;
    }
    if (retried) {
      finalContent = retried;
      unverified = ungroundedFigures(finalContent, sourceText());
    }
  }

  if (violatesGuardrails(finalContent)) {
    return NextResponse.json({ ok: true, reply: GUARDRAIL_FALLBACK_REPLY, model: OLLAMA_CHAT_MODEL, guardrailTripped: true, toolsUsed });
  }
  const cleaned = finalContent.replace(/^\s*_?Basis:.*$/gim, "").trim();
  const caveat = unverified.length ? `

> Note: ${unverified.map((n) => n.toLocaleString("en-IN")).join(", ")} could not be verified against the live data — treat as an estimate.` : "";
  const reply = toolsUsed.length ? `${cleaned}${caveat}

_Basis: ${toolsUsed.join(", ")}_` : `${cleaned}${caveat}`;
  return NextResponse.json({ ok: true, reply, model: OLLAMA_CHAT_MODEL, guardrailTripped: false, toolsUsed, verified: unverified.length === 0 });
}
