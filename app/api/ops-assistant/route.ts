import { NextResponse } from "next/server";
import { chatRaw, ollamaStatus, OLLAMA_CHAT_MODEL, type ChatTurn } from "@/lib/ai/ollama";
import { TOOL_SCHEMAS, executeTool, type ToolCall } from "@/lib/ai/tools";
import type { OpsSnapshot } from "@/lib/ai/opsSnapshot";
import { buildOpsSystemPrompt, type AssistantLanguage } from "@/lib/ai/opsAssistantPrompt";
import { violatesGuardrails, GUARDRAIL_FALLBACK_REPLY } from "@/lib/ai/conciergePrompt";

const MAX_TOOL_CALLS = 4;

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

  const status = await ollamaStatus();
  if (!status.reachable) return NextResponse.json({ ok: false, reason: "ollama-unreachable" }, { status: 503 });
  if (!status.chatModelPulled) return NextResponse.json({ ok: false, reason: "chat-model-missing", model: OLLAMA_CHAT_MODEL }, { status: 503 });

  const lang: AssistantLanguage = language === "hi" || language === "mr" ? language : "en";
  const systemPrompt = buildOpsSystemPrompt(lang, snapshot.role);
  const messages: ChatTurn[] = [{ role: "system", content: systemPrompt }, ...(history ?? []).slice(-6), { role: "user", content: message }];

  const toolsUsed: string[] = [];
  let rounds = 0;
  let finalContent: string | null = null;

  while (rounds < MAX_TOOL_CALLS) {
    const response = await chatRaw(messages, rounds === 0 ? TOOL_SCHEMAS : undefined);
    if (!response) break;

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: response.content ?? "" });
      for (const tc of response.tool_calls) {
        const call: ToolCall = { name: tc.function.name, arguments: tc.function.arguments ?? {} };
        toolsUsed.push(call.name);
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

  if (violatesGuardrails(finalContent)) {
    return NextResponse.json({ ok: true, reply: GUARDRAIL_FALLBACK_REPLY, model: OLLAMA_CHAT_MODEL, guardrailTripped: true, toolsUsed });
  }
  return NextResponse.json({ ok: true, reply: finalContent, model: OLLAMA_CHAT_MODEL, guardrailTripped: false, toolsUsed });
}
