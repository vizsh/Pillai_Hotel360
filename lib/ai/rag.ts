/** Pure retrieval math — no network calls, fully unit-testable. Cosine similarity over
 * whatever embeddings the caller already fetched, plus top-K selection. Deliberately not a
 * vector database: the resort knowledge base (lib/ai/knowledge.ts) is a few dozen documents,
 * small enough that brute-force cosine similarity in JS is instant and a real vector DB would
 * be pure overhead. */

export interface EmbeddedDoc {
  id: string;
  text: string;
  source: string;
  embedding: number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface RetrievedDoc {
  id: string;
  text: string;
  source: string;
  score: number;
}

/** Ranks every embedded doc against the query embedding, returns the top K — the caller
 * decides a minimum score cutoff, since "top K of an empty/irrelevant match" is still
 * technically an answer and it's the prompt-builder's job to decide whether score is high
 * enough to trust. */
export function retrieveTopK(queryEmbedding: number[], docs: EmbeddedDoc[], k: number): RetrievedDoc[] {
  return docs
    .map((d) => ({ id: d.id, text: d.text, source: d.source, score: cosineSimilarity(queryEmbedding, d.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
