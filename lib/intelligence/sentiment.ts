import type { ResortModel } from "@/lib/architecture/types";
import type { Recommendation, RequestType, Review, ServiceRequest, SimState } from "@/lib/sim/types";
import { aspectLexicon, negations, negativeWords, positiveWords } from "@/lib/sim/text";
import { clamp } from "@/lib/utils";

export function scoreText(text: string): { overall: number; aspects: Record<string, number> } {
  const lower = text.toLowerCase();
  const clauses = lower.split(/[,.;!?]| but | although | though | however /);
  const aspects: Record<string, { sum: number; n: number }> = {};
  let total = 0;
  let n = 0;
  for (const clause of clauses) {
    const words = clause.trim().split(/\s+/);
    if (!words.length) continue;
    const negated = words.some((w) => negations.includes(w));
    let s = 0;
    for (const p of positiveWords) if (clause.includes(p)) s += 1;
    for (const q of negativeWords) if (clause.includes(q)) s -= 1;
    if (negated) s = -s * 0.8;
    if (s === 0) continue;
    s = clamp(s / 2, -1, 1);
    total += s;
    n++;
    for (const [aspect, { keywords }] of Object.entries(aspectLexicon)) {
      if (keywords.some((k) => clause.includes(k))) {
        aspects[aspect] ??= { sum: 0, n: 0 };
        aspects[aspect].sum += s;
        aspects[aspect].n++;
      }
    }
  }
  return {
    overall: n ? clamp(total / n, -1, 1) : 0,
    aspects: Object.fromEntries(Object.entries(aspects).map(([k, v]) => [k, v.sum / v.n])),
  };
}

/** Aspects with a request type a review's complaint can be deterministically traced to —
 * only the aspects where the lexicon's dept maps onto a real, dispatchable RequestType.
 * "service"/"value"/"noise" have no single matching request type and are left unlinked
 * rather than guessed at. */
const ASPECT_REQUEST_TYPE: Partial<Record<string, RequestType>> = {
  hvac: "maintenance",
  facilities: "maintenance",
  cleanliness: "housekeeping",
  room: "housekeeping",
  food: "fnb",
};
/** How far back from the review a causal request can plausibly sit — long enough to cover a
 * multi-day stay's most recent incident, short enough that "linked" still means something. */
const ROOT_CAUSE_WINDOW_MIN = 3 * 24 * 60;

export interface RootCauseLink {
  request: ServiceRequest;
  aspect: string;
  delayMinutes: number;
  slaBreached: boolean;
}

/** Matches a negative review to the specific ServiceRequest that plausibly caused it — the
 * blueprint's own headline example ("AC not working" → ticket #482 open 6 hours). Picks
 * the review's most negative linkable aspect, then the most recent same-room request of the
 * matching type created before the review. Best-effort: lib/sim/engine.ts prunes completed
 * requests 6h after completion, so a request from early in a long stay may already be gone
 * by checkout — this only ever surfaces a link that's still findable, never fabricates one. */
export function rootCauseLink(review: Review, state: SimState): RootCauseLink | null {
  const candidates = Object.entries(review.aspects)
    .filter(([aspect, score]) => score < -0.15 && ASPECT_REQUEST_TYPE[aspect])
    .sort((a, b) => a[1] - b[1]);
  for (const [aspect] of candidates) {
    const reqType = ASPECT_REQUEST_TYPE[aspect]!;
    const matches = Object.values(state.requests).filter(
      (r) => r.roomId === review.roomId && r.type === reqType && r.createdAt <= review.createdAt && review.createdAt - r.createdAt < ROOT_CAUSE_WINDOW_MIN,
    );
    if (!matches.length) continue;
    const request = matches.sort((a, b) => b.createdAt - a.createdAt)[0];
    const delayMinutes = (request.completedAt ?? state.t) - request.createdAt;
    return { request, aspect, delayMinutes, slaBreached: delayMinutes > request.slaMin };
  }
  return null;
}

export interface AspectSummary {
  aspect: string;
  dept: string;
  score: number;
  mentions: number;
  trend: number;
}

export function aspectSummary(reviews: Review[], now: number): AspectSummary[] {
  const recent = reviews.filter((r) => now - r.createdAt < 7 * 24 * 60);
  const prior = reviews.filter((r) => now - r.createdAt >= 7 * 24 * 60 && now - r.createdAt < 14 * 24 * 60);
  const agg = (rs: Review[]) => {
    const m: Record<string, { sum: number; n: number }> = {};
    for (const r of rs)
      for (const [a, s] of Object.entries(r.aspects)) {
        m[a] ??= { sum: 0, n: 0 };
        m[a].sum += s;
        m[a].n++;
      }
    return m;
  };
  const R = agg(recent);
  const P = agg(prior);
  return Object.keys(aspectLexicon).map((aspect) => {
    const r = R[aspect];
    const p = P[aspect];
    const score = r ? r.sum / r.n : 0;
    const prev = p ? p.sum / p.n : score;
    return { aspect, dept: aspectLexicon[aspect].dept, score, mentions: r?.n ?? 0, trend: score - prev };
  });
}

export function sentimentRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const out: Recommendation[] = [];
  const summary = aspectSummary(state.reviews, state.t);
  for (const s of summary) {
    if (s.mentions < 3 || s.score > -0.2) continue;
    const floorCounts: Record<number, number> = {};
    for (const rv of state.reviews.slice(-60)) {
      if ((rv.aspects[s.aspect] ?? 0) < 0) {
        const f = model.roomById.get(rv.roomId)?.floor ?? 0;
        floorCounts[f] = (floorCounts[f] ?? 0) + 1;
      }
    }
    const worstFloor = Object.entries(floorCounts).sort((a, b) => b[1] - a[1])[0];
    out.push({
      id: `rec-sent-${s.aspect}`,
      module: "sentiment",
      title: `${s.aspect[0].toUpperCase() + s.aspect.slice(1)} sentiment negative · route to ${s.dept}`,
      body: `${s.mentions} mentions in the last 7 days averaging ${s.score.toFixed(2)}${worstFloor ? `, concentrated on floor ${worstFloor[0]} (${worstFloor[1]} mentions)` : ""}.`,
      confidence: clamp(0.5 + s.mentions * 0.06, 0, 0.9),
      basis: [
        `aspect-based lexicon scoring with clause-level negation`,
        `${s.mentions} recent mentions · trend ${s.trend >= 0 ? "+" : ""}${s.trend.toFixed(2)} vs prior week`,
      ],
      impact: `Each 0.1 improvement in ${s.aspect} sentiment correlates with ~0.04 GSS uplift in the modeled population.`,
      action: `Open a ${s.dept} quality action${worstFloor ? ` and inspect floor ${worstFloor[0]}` : ""}.`,
      targetKind: "resort",
      targetId: s.dept,
      createdAt: state.t,
      status: "pending",
      payload: { aspect: s.aspect, dept: s.dept, floor: worstFloor ? +worstFloor[0] : null },
    });
  }
  return out;
}
