import type { ResortModel } from "@/lib/architecture/types";
import type { Guest, Recommendation, SimState } from "@/lib/sim/types";
import { DAY } from "@/lib/sim/seed";
import { mulberry32, clamp } from "@/lib/utils";

export interface Cluster {
  id: number;
  name: string;
  size: number;
  centroid: number[];
  members: string[];
  avgSpend: number;
  avgNights: number;
  avgLead: number;
  avgSentiment: number;
  offer: string;
  color: string;
  elasticity: number;
}

/**
 * Price elasticity of demand by segment name, on the same scale as the resort-wide
 * constant-elasticity model in lib/intelligence/pricing.ts (more negative = more
 * price-sensitive). Loyal/high-spend and short-lead corporate demand is comparatively
 * inelastic (need drives the booking); leisure booked well in advance and pure
 * value-seekers shop harder on rate.
 */
export const segmentElasticity: Record<string, number> = {
  "High-Value Loyal": -0.55,
  "Short-Lead Business": -0.7,
  "Wellness Seekers": -1.05,
  Families: -1.15,
  "Planned Leisure": -1.35,
  "Value Seekers": -1.9,
};

const featureNames = ["spend/night", "nights", "lead days", "party size", "spa share", "loyalty"];

export function guestVector(g: Guest): number[] {
  const nights = Math.max(1, (g.checkOut - g.checkIn) / DAY);
  const spend = (g.spendRoom + g.spendFnb + g.spendSpa + g.spendOther) / nights;
  const loyalty = { none: 0, silver: 1, gold: 2, platinum: 3 }[g.loyalty];
  return [spend, nights, g.leadDays, g.adults + g.children, g.spendSpa / Math.max(1, spend * nights), loyalty];
}

function normalize(vecs: number[][]) {
  const dims = vecs[0].length;
  const mins = Array(dims).fill(Infinity);
  const maxs = Array(dims).fill(-Infinity);
  for (const v of vecs) v.forEach((x, i) => {
    mins[i] = Math.min(mins[i], x);
    maxs[i] = Math.max(maxs[i], x);
  });
  return { norm: vecs.map((v) => v.map((x, i) => (maxs[i] === mins[i] ? 0 : (x - mins[i]) / (maxs[i] - mins[i])))), mins, maxs };
}

const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

export function kmeans(vecs: number[][], k: number, seed: number, iters = 30) {
  const rand = mulberry32(seed);
  const n = vecs.length;
  if (n < k) return { assign: vecs.map((_, i) => i % k), centroids: vecs.slice(0, k) };
  const centroids: number[][] = [vecs[Math.floor(rand() * n)]];
  while (centroids.length < k) {
    const d2 = vecs.map((v) => Math.min(...centroids.map((c) => dist(v, c) ** 2)));
    const total = d2.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      x -= d2[i];
      if (x <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push([...vecs[idx]]);
  }
  let assign = Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    const next = vecs.map((v) => {
      let best = 0;
      let bd = Infinity;
      centroids.forEach((c, i) => {
        const d = dist(v, c);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    });
    if (next.every((a, i) => a === assign[i])) break;
    assign = next;
    for (let c = 0; c < k; c++) {
      const members = vecs.filter((_, i) => assign[i] === c);
      if (!members.length) continue;
      centroids[c] = members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    }
  }
  return { assign, centroids };
}

const palette = ["#2dd4bf", "#f5a524", "#c084fc", "#60a5fa", "#f472b6"];

export function segmentGuests(state: SimState, model: ResortModel): Cluster[] {
  const guests = Object.values(state.guests).filter((g) => g.roomId);
  if (guests.length < 5) return [];
  const raw = guests.map(guestVector);
  const { norm } = normalize(raw);
  const { assign, centroids } = kmeans(norm, 5, state.seed);
  const nameCounts = new Map<string, number>();
  return centroids.map((c, i) => {
    const members = guests.filter((_, j) => assign[j] === i);
    const rawMembers = raw.filter((_, j) => assign[j] === i);
    const avg = (d: number) => (rawMembers.length ? rawMembers.reduce((s, v) => s + v[d], 0) / rawMembers.length : 0);
    const avgSpend = avg(0);
    const avgNights = avg(1);
    const avgLead = avg(2);
    const party = avg(3);
    const spa = avg(4);
    const loyalty = avg(5);
    let name = "Value Seekers";
    let offer = "Bundle breakfast + late checkout at a 6% premium; converts price-sensitive stays to higher ADR.";
    if (avgSpend > 22000 || loyalty > 2) {
      name = "High-Value Loyal";
      offer = "Guaranteed suite upgrade on next stay and a private sky bar tasting; protect and grow lifetime value.";
    } else if (spa > 0.18) {
      name = "Wellness Seekers";
      offer = "3-treatment spa pass at 15% off, pre-sold at booking; lifts spa attach and length of stay.";
    } else if (party >= 3) {
      name = "Families";
      offer = "Kids-eat-free dinner and connecting-room guarantee; drives 3+ night stays in shoulder weeks.";
    } else if (avgNights < 2.2 && avgLead < 12) {
      name = "Short-Lead Business";
      offer = "Corporate rate with flexible cancellation and early breakfast; targets midweek occupancy gaps.";
    } else if (avgLead > 30) {
      name = "Planned Leisure";
      offer = "Early-bird 10% for 45+ day lead with sea-view upsell at booking; locks in shoulder demand.";
    }
    const baseName = name;
    const seen = nameCounts.get(name) ?? 0;
    nameCounts.set(name, seen + 1);
    if (seen > 0) name = `${name} (${seen + 1})`;
    return {
      id: i,
      name,
      size: members.length,
      centroid: c,
      members: members.map((g) => g.id),
      avgSpend,
      avgNights,
      avgLead,
      avgSentiment: members.length ? members.reduce((s, g) => s + g.sentiment, 0) / members.length : 0,
      offer,
      color: palette[i],
      elasticity: segmentElasticity[baseName] ?? -1.2,
    };
  });
}

export { featureNames };

export function segmentationRecommendations(state: SimState, model: ResortModel): Recommendation[] {
  const clusters = segmentGuests(state, model);
  const out: Recommendation[] = [];
  const unhappy = clusters.filter((c) => c.size >= 4 && c.avgSentiment < 0.05).sort((a, b) => a.avgSentiment - b.avgSentiment)[0];
  if (unhappy) {
    out.push({
      id: `rec-seg-${unhappy.name.replace(/\s/g, "").toLowerCase()}`,
      module: "segmentation",
      title: `${unhappy.name} segment trending negative (${unhappy.size} in-house)`,
      body: `Cluster average sentiment ${unhappy.avgSentiment.toFixed(2)}, spend ₹${Math.round(unhappy.avgSpend).toLocaleString("en-IN")}/night. Targeted recovery is cheaper than churn at this spend level.`,
      confidence: clamp(0.5 + unhappy.size * 0.03, 0, 0.85),
      basis: [`k-means (k=5, k-means++ init) over ${featureNames.join(", ")}`, `${Object.values(state.guests).filter((g) => g.roomId).length} in-house guests, min-max normalized`],
      impact: `Retaining this cluster protects ≈ ₹${Math.round(unhappy.avgSpend * unhappy.avgNights * unhappy.size).toLocaleString("en-IN")} of in-house revenue.`,
      action: `Push segment offer: ${unhappy.offer}`,
      targetKind: "resort",
      targetId: "segment",
      createdAt: state.t,
      status: "pending",
      payload: { cluster: unhappy.id, members: unhappy.members },
    });
  }
  return out;
}
