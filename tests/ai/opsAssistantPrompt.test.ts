import { describe, expect, it } from "vitest";
import { buildOpsSystemPrompt, LANGUAGE_SPEECH_TAG } from "@/lib/ai/opsAssistantPrompt";

describe("buildOpsSystemPrompt", () => {
  it("instructs the model to use tables/bullets and never invent data", () => {
    const prompt = buildOpsSystemPrompt("en", "gm");
    expect(prompt.toLowerCase()).toContain("table");
    expect(prompt.toLowerCase()).toContain("never invent");
  });

  it("stays silent on language instruction for English, but adds one for Hindi/Marathi", () => {
    const en = buildOpsSystemPrompt("en", "gm");
    const hi = buildOpsSystemPrompt("hi", "gm");
    const mr = buildOpsSystemPrompt("mr", "gm");
    expect(en.toLowerCase()).not.toContain("respond in");
    expect(hi.toLowerCase()).toContain("respond in");
    expect(mr.toLowerCase()).toContain("respond in");
  });

  it("always forbids refund/compensation/discount language regardless of role or language", () => {
    for (const lang of ["en", "hi", "mr"] as const) {
      const prompt = buildOpsSystemPrompt(lang, "front-office-manager");
      expect(prompt.toLowerCase()).toContain("refund");
    }
  });

  it("maps every assistant language to a real BCP-47 speech tag", () => {
    expect(LANGUAGE_SPEECH_TAG.en).toBe("en-IN");
    expect(LANGUAGE_SPEECH_TAG.hi).toBe("hi-IN");
    expect(LANGUAGE_SPEECH_TAG.mr).toBe("mr-IN");
  });
});
