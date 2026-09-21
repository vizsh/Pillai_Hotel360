import { describe, expect, it } from "vitest";
import { scoreText } from "@/lib/intelligence/sentiment";

describe("scoreText", () => {
  it("scores clearly positive text above zero", () => {
    const res = scoreText("The room was spotless and the staff were excellent and attentive.");
    expect(res.overall).toBeGreaterThan(0);
  });

  it("scores clearly negative text below zero", () => {
    const res = scoreText("The room was dirty and the shower was cold and dripping.");
    expect(res.overall).toBeLessThan(0);
  });

  it("returns zero for neutral text with no lexicon hits", () => {
    const res = scoreText("We arrived at the property around noon.");
    expect(res.overall).toBe(0);
  });

  it("negation flips a positive word toward negative", () => {
    const plain = scoreText("The staff were good.");
    const negated = scoreText("The staff were not good.");
    expect(negated.overall).toBeLessThan(plain.overall);
  });

  it("stays within [-1, 1] for repeated/emphatic language", () => {
    const res = scoreText("excellent excellent excellent stunning superb fantastic lovely great");
    expect(res.overall).toBeLessThanOrEqual(1);
    expect(res.overall).toBeGreaterThanOrEqual(-1);
  });

  it("routes aspect scores only to aspects whose keywords actually appear", () => {
    const res = scoreText("The room was spotless.");
    expect(Object.keys(res.aspects)).toContain("room");
    expect(Object.keys(res.aspects)).not.toContain("food");
  });
});
