import { describe, expect, it } from "vitest";
import { buildKnowledgeBase } from "@/lib/ai/knowledge";
import { infoAnswers } from "@/lib/intelligence/concierge";
import { getModel } from "@/lib/architecture/model";

describe("buildKnowledgeBase", () => {
  it("includes every concierge.ts infoAnswer, reused rather than re-authored", () => {
    const model = getModel();
    const docs = buildKnowledgeBase(model);
    for (const [, text] of infoAnswers) {
      expect(docs.some((d) => d.text === text)).toBe(true);
    }
  });

  it("covers every room type actually present in the generated model", () => {
    const model = getModel();
    const docs = buildKnowledgeBase(model);
    const typesInModel = new Set(model.rooms.map((r) => r.type));
    for (const type of typesInModel) {
      expect(docs.some((d) => d.id === `room-type-${type}`)).toBe(true);
    }
  });

  it("gives every document a source pointing somewhere in the codebase, never empty", () => {
    const docs = buildKnowledgeBase(getModel());
    for (const d of docs) {
      expect(d.source.length).toBeGreaterThan(0);
      expect(d.text.length).toBeGreaterThan(0);
    }
  });

  it("produces unique document ids", () => {
    const docs = buildKnowledgeBase(getModel());
    const ids = docs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
