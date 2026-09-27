import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmChat, toNugenMessages } from "@/lib/ai/llm";

const original = { ...process.env };

describe("llm provider chain", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("folds tool results into user turns (Nugen only knows system/user/assistant)", () => {
    const out = toNugenMessages([
      { role: "system", content: "s" },
      { role: "assistant", content: "" },
      { role: "tool", content: '{"a":1}' },
    ]);
    expect(out.map((m) => m.role)).toEqual(["system", "assistant", "user"]);
    expect(out[2].content).toContain('{"a":1}');
  });

  it("uses Nugen when configured and reports it as the provider", async () => {
    process.env.NUGEN_API_KEY = "k";
    process.env.NUGEN_MODEL_ID = "model_abc";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "aligned answer" } }] }), { status: 200 }));
    const r = await llmChat([{ role: "user", content: "hi" }]);
    expect(r?.provider).toBe("nugen");
    expect(r?.content).toBe("aligned answer");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v3/inference/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string).model).toBe("model_abc");
  });

  it("parses Nugen tool calls whose arguments arrive as a JSON string", async () => {
    process.env.NUGEN_API_KEY = "k2";
    process.env.NUGEN_MODEL_ID = "model_abc";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [{ function: { name: "find_room", arguments: '{"query":"204"}' } }] } }] }), { status: 200 }));
    const r = await llmChat([{ role: "user", content: "who is in 204" }], [{ type: "function" }]);
    expect(r?.tool_calls?.[0].function).toEqual({ name: "find_room", arguments: { query: "204" } });
  });
});
