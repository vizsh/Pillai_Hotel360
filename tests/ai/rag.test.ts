import { describe, expect, it } from "vitest";
import { cosineSimilarity, retrieveTopK } from "@/lib/ai/rag";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for mismatched lengths or empty vectors instead of throwing", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0, not NaN, when one vector is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("retrieveTopK", () => {
  const docs = [
    { id: "a", text: "pool hours", source: "s", embedding: [1, 0, 0] },
    { id: "b", text: "spa hours", source: "s", embedding: [0.9, 0.1, 0] },
    { id: "c", text: "unrelated", source: "s", embedding: [0, 0, 1] },
  ];

  it("ranks by descending similarity to the query", () => {
    const results = retrieveTopK([1, 0, 0], docs, 3);
    expect(results.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it("respects the k limit", () => {
    expect(retrieveTopK([1, 0, 0], docs, 1)).toHaveLength(1);
    expect(retrieveTopK([1, 0, 0], docs, 2)).toHaveLength(2);
  });

  it("returns an empty array for an empty doc set", () => {
    expect(retrieveTopK([1, 0, 0], [], 4)).toHaveLength(0);
  });
});
