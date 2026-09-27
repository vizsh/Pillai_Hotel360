import { NextResponse } from "next/server";
import { llmChat, llmStatus } from "@/lib/ai/llm";
import { parseScenarioReply, ruleParseScenario, scenarioPrompt } from "@/lib/ai/scenarioParse";

/** Plain-English scenario -> what-if parameters. Model when available, deterministic parser otherwise;
 * either way the numbers are clamped before the simulator sees them. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 300) : "";
  if (!text) return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });

  const status = await llmStatus();
  if (status.provider !== "none") {
    const reply = await llmChat(scenarioPrompt(text));
    const parsed = reply?.content ? parseScenarioReply(reply.content) : null;
    if (parsed && reply) return NextResponse.json({ ok: true, scenario: parsed, provider: reply.provider, model: reply.model });
  }
  return NextResponse.json({ ok: true, scenario: ruleParseScenario(text), provider: "rules", model: "rule-based parser" });
}
