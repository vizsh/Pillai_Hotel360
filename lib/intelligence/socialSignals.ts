import { clamp } from "@/lib/utils";
import type { SocialSignalItem, HazardEvent } from "@/app/api/social-weather-signals/route";

/** Same adapter-seam shape as lib/intelligence/weather.ts's live weather (globalThis rather than
 * a module-level `let`, for the identical reason documented there — Next's client/server module
 * split gives each import its own copy of a plain `let`). hooks/useSocialWeatherSignals.ts
 * populates this from the real fetch (app/api/social-weather-signals); everything else here
 * reads it back. */
declare global {
  var __socialSignals: { items: SocialSignalItem[]; hazards: HazardEvent[]; trendScore: number | null; sources: Record<string, boolean>; fetchedAt: number } | null | undefined;
}
const STALE_MS = 3 * 60 * 60 * 1000;

const CONCERN_KEYWORDS = ["flood", "storm", "cyclone", "monsoon", "waterlog", "heatwave", "heat wave", "evacuat", "warning", "alert", "cancel", "washed out", "landslide"];

export function setSocialSignals(payload: { items: SocialSignalItem[]; hazards: HazardEvent[]; trendScore: number | null; sources: Record<string, boolean> } | null) {
  globalThis.__socialSignals = payload ? { ...payload, fetchedAt: Date.now() } : null;
}

export function socialSignalsSource(): "live" | "none" {
  const s = globalThis.__socialSignals;
  return s && Date.now() - s.fetchedAt < STALE_MS ? "live" : "none";
}

export function getSocialSignals(): SocialSignalItem[] {
  return socialSignalsSource() === "live" ? (globalThis.__socialSignals?.items ?? []) : [];
}

export function getHazardEvents(): HazardEvent[] {
  return socialSignalsSource() === "live" ? (globalThis.__socialSignals?.hazards ?? []) : [];
}

export function getTrendScore(): number | null {
  return socialSignalsSource() === "live" ? (globalThis.__socialSignals?.trendScore ?? null) : null;
}

export function getSignalSources(): Record<string, boolean> {
  return socialSignalsSource() === "live" ? (globalThis.__socialSignals?.sources ?? {}) : {};
}

/** 0-1 "how much of the live public/official signal is actually about weather trouble right
 * now" — three real inputs blended, not one keyword count pretending to be a model:
 *  - the fraction of fetched posts/articles whose text matches a flood/storm/cancellation
 *    keyword (coarse, but transparent about being coarse),
 *  - any real, currently-open GDACS hazard event within the region (an official source
 *    outweighs an anonymous post, so it's weighted 2x a keyword hit),
 *  - the live Google Trends "search interest" reading for the region, when reachable (normalized
 *    0-100 -> 0-1), since a spike in people searching "Goa flooding" is a genuinely different
 *    signal from either of the above. */
export function publicConcernScore(): number {
  const items = getSocialSignals();
  const hazards = getHazardEvents();
  const trend = getTrendScore();
  const keywordScore = items.length ? items.filter((i) => CONCERN_KEYWORDS.some((k) => i.title.toLowerCase().includes(k))).length / items.length : 0;
  const hazardScore = hazards.length ? 1 : 0;
  const trendScoreNorm = trend !== null ? trend / 100 : 0;
  const weights = { keyword: 1, hazard: 2, trend: 1 };
  const totalWeight = weights.keyword + (hazards.length ? weights.hazard : 0) + (trend !== null ? weights.trend : 0);
  if (totalWeight === 0) return 0;
  return clamp((keywordScore * weights.keyword + hazardScore * weights.hazard + trendScoreNorm * weights.trend) / totalWeight, 0, 1);
}
