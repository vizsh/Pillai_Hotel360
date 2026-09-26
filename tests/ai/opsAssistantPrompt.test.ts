import { describe, expect, it } from "vitest";
import { buildOpsSystemPrompt, LANGUAGE_SPEECH_TAG } from "@/lib/ai/opsAssistantPrompt";

describe("buildOpsSystemPrompt", () => {
  it("instructs the model to use tables/bullets and never invent data", () => {
    const prompt = buildOpsSystemPrompt("en", "gm");
    expect(prompt.toLowerCase()).toContain("table");
    expect(prompt.toLowerCase()).toContain("never invent");
  });

  it("gives an explicit language instruction for every language, including English", () => {
    // Verified live: without an explicit instruction for English too, the model kept
    // replying in Hindi to a plain English question once the conversation history
    // contained an earlier Hindi exchange — silence on English was the actual bug.
    const en = buildOpsSystemPrompt("en", "gm");
    const hi = buildOpsSystemPrompt("hi", "gm");
    const mr = buildOpsSystemPrompt("mr", "gm");
    expect(en.toLowerCase()).toContain("respond in english");
    expect(hi.toLowerCase()).toContain("respond in");
    expect(mr.toLowerCase()).toContain("respond in");
  });

  it("every language instruction says explicitly that earlier messages don't decide the reply language", () => {
    for (const lang of ["en", "hi", "mr"] as const) {
      const prompt = buildOpsSystemPrompt(lang, "gm");
      expect(prompt.toLowerCase()).toContain("regardless of what language earlier messages");
    }
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
