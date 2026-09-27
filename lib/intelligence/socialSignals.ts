import { clamp } from "@/lib/utils";
import type { SocialSignalItem, HazardEvent, AviationActivity } from "@/app/api/social-weather-signals/route";
import { disruptionScoreOf, type SignalAnalysis } from "@/lib/ai/signalIntel";

/** Same adapter-seam shape as lib/intelligence/weather.ts's live weather (globalThis rather than
 * a module-level `let`, for the identical reason documented there — Next's client/server module
 * split gives each import its own copy of a plain `let`). hooks/useSocialWeatherSignals.ts
 * populates this from the real fetch (app/api/social-weather-signals); everything else here
 * reads it back. */
declare global {
  var __socialSignals: { items: SocialSignalItem[]; hazards: HazardEvent[]; trendScore: number | null; sources: Record<string, boolean>; aviationActivity: AviationActivity | null; fetchedAt: number } | null | undefined;
}
declare global {
  var __signalAnalysis: { byId: Record<string, SignalAnalysis>; provider: string; model: string } | null | undefined;
}
const STALE_MS = 3 * 60 * 60 * 1000;

const CONCERN_KEYWORDS = ["flood", "storm", "cyclone", "monsoon", "waterlog", "heatwave", "heat wave", "evacuat", "warning", "alert", "cancel", "washed out", "landslide"];

export function setSocialSignals(payload: { items: SocialSignalItem[]; hazards: HazardEvent[]; trendScore: number | null; sources: Record<string, boolean>; aviationActivity?: AviationActivity | null } | null) {
  globalThis.__socialSignals = payload ? { ...payload, aviationActivity: payload.aviationActivity ?? null, fetchedAt: Date.now() } : null;
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

export function getAviationActivity(): AviationActivity | null {
  return socialSignalsSource() === "live" ? (globalThis.__socialSignals?.aviationActivity ?? null) : null;
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
  const guestTerm = guestWeatherComplaintTerm();
  const keywordScore = items.length ? items.filter((i) => CONCERN_KEYWORDS.some((k) => i.title.toLowerCase().includes(k))).length / items.length : 0;
  const hazardScore = hazards.length ? 1 : 0;
  const trendScoreNorm = trend !== null ? trend / 100 : 0;
  const weights = { keyword: 1, hazard: 2, trend: 1, guest: 1.5 };
  const guestActive = (globalThis.__guestWeatherComplaints ?? 0) > 0;
  const totalWeight = weights.keyword + (hazards.length ? weights.hazard : 0) + (trend !== null ? weights.trend : 0) + (guestActive ? weights.guest : 0);
  if (totalWeight === 0) return 0;
  return clamp((keywordScore * weights.keyword + hazardScore * weights.hazard + trendScoreNorm * weights.trend + guestTerm * weights.guest) / totalWeight, 0, 1);
}

export function setSignalAnalysis(payload: { analysis: Record<string, SignalAnalysis>; provider: string; model: string } | null) {
  globalThis.__signalAnalysis = payload ? { byId: payload.analysis, provider: payload.provider, model: payload.model } : null;
}

export function getSignalAnalysis(): { byId: Record<string, SignalAnalysis>; provider: string; model: string } | null {
  return socialSignalsSource() === "live" ? (globalThis.__signalAnalysis ?? null) : null;
}

/** 0-1: urgency-weighted share of live posts describing real traveller disruption (cancellations, delays,
 * flooding, safety) — read by the simulation as a small extra nudge toward complaints and front-desk load. */
export function disruptionScore(): number {
  const a = getSignalAnalysis();
  return a ? disruptionScoreOf(Object.values(a.byId)) : 0;
}

// ---------------------------------------------------------------------------------------------
// Social signal as a TRIGGER, not just a nudge (see docs/WEATHER_AND_SIGNALS.md §8). A single
// post is never enough to act on — the same persistence discipline as the CCTV gate — so this
// tracks disruption-score history over successive polls and only calls something a "burst" once
// it has genuinely risen over a real window, and only calls it "corroborated" once an
// independent official agency (GDACS or EONET — two different agencies, not one asked twice)
// reports a real event in the region within the same window.
// ---------------------------------------------------------------------------------------------
declare global {
  var __socialHistory: { t: number; disruption: number; providers: number }[] | undefined;
}
const HISTORY_MAX_SAMPLES = 12; // ~4h of history at the 20-minute poll interval
const BURST_MIN_SAMPLES = 2;

/** Called once per poll (useSocialWeatherSignals.ts) after setSignalAnalysis, so the history is
 * keyed to the same cadence as the fetch itself rather than a separate timer. */
export function recordDisruptionSample(): void {
  const hist = (globalThis.__socialHistory ??= []);
  const providers = new Set(getHazardEvents().map((h) => h.provider)).size;
  hist.push({ t: Date.now(), disruption: disruptionScore(), providers });
  if (hist.length > HISTORY_MAX_SAMPLES) hist.shift();
}

export interface SocialTriggerState {
  /** 0-1: how much the disruption score has risen over the tracked window, clamped. */
  burstRate: number;
  /** How many independent official agencies (GDACS, EONET) currently report a regional event. */
  corroboratingProviders: number;
  /** True once burst and corroboration both clear their gates — the same two-factor discipline
   * a CCTV alert needs (persistence AND a real measured signature), applied to public chatter. */
  triggered: boolean;
  samples: number;
}

export function socialTriggerState(): SocialTriggerState {
  const hist = globalThis.__socialHistory ?? [];
  const providers = hist.length ? hist[hist.length - 1].providers : 0;
  if (hist.length < BURST_MIN_SAMPLES) return { burstRate: 0, corroboratingProviders: providers, triggered: false, samples: hist.length };
  const latest = hist[hist.length - 1].disruption;
  const baseline = hist.slice(0, -1).reduce((s, h) => s + h.disruption, 0) / (hist.length - 1);
  const burstRate = clamp(latest - baseline, 0, 1);
  const triggered = latest >= 0.35 && burstRate >= 0.12 && providers >= 1;
  return { burstRate, corroboratingProviders: providers, triggered, samples: hist.length };
}

export function resetSocialHistory(): void {
  globalThis.__socialHistory = [];
}

// ---------------------------------------------------------------------------------------------
// Feature D — the concern score is not one-directional. A real guest complaint that arrived
// through the guest-app bridge and mentions a weather-linked problem (leak, flooding, AC/heat)
// is itself evidence something is going wrong on the ground, independent of what anyone posted
// online — so it feeds back into the SAME publicConcernScore() every badge, the cascade and the
// assistants already read. engine.ts sets this once per tick from real open requests; nothing
// here invents a mechanic, it closes a loop between two things the system already tracks.
// ---------------------------------------------------------------------------------------------
declare global {
  var __guestWeatherComplaints: number | undefined;
}
export function setGuestWeatherComplaintSignal(openCount: number): void {
  globalThis.__guestWeatherComplaints = openCount;
}
function guestWeatherComplaintTerm(): number {
  const n = globalThis.__guestWeatherComplaints ?? 0;
  return Math.min(1, n / 4); // 4+ simultaneous weather-linked complaints reads as fully concerning on its own
}
