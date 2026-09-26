import { clamp } from "@/lib/utils";
import type { SocialSignalItem } from "@/app/api/social-weather-signals/route";

/** Same adapter-seam shape as lib/intelligence/weather.ts's live weather (globalThis rather than
 * a module-level `let`, for the identical reason documented there — Next's client/server module
 * split gives each import its own copy of a plain `let`). hooks/useSocialWeatherSignals.ts
 * populates this from the real fetch (app/api/social-weather-signals); everything else here
 * reads it back. */
declare global {
  var __socialSignals: { items: SocialSignalItem[]; fetchedAt: number } | null | undefined;
}
const STALE_MS = 3 * 60 * 60 * 1000;

const CONCERN_KEYWORDS = ["flood", "storm", "cyclone", "monsoon", "waterlog", "heatwave", "heat wave", "evacuat", "warning", "alert", "cancel", "washed out", "landslide"];

export function setSocialSignals(items: SocialSignalItem[] | null) {
  globalThis.__socialSignals = items ? { items, fetchedAt: Date.now() } : null;
}

export function socialSignalsSource(): "live" | "none" {
  const s = globalThis.__socialSignals;
  return s && Date.now() - s.fetchedAt < STALE_MS ? "live" : "none";
}

export function getSocialSignals(): SocialSignalItem[] {
  return socialSignalsSource() === "live" ? (globalThis.__socialSignals?.items ?? []) : [];
}

/** Coarse 0-1 "how much of the live public chatter is actually about weather trouble right
 * now" signal — the fraction of fetched posts/articles whose title matches a flood/storm/
 * cancellation keyword. Deliberately coarse (a keyword hit-rate, not a trained classifier) —
 * honest about what it is, and enough to nudge the simulation's request mix (see engine.ts)
 * without overclaiming a sentiment model this hackathon's time budget doesn't support. */
export function publicConcernScore(): number {
  const items = getSocialSignals();
  if (!items.length) return 0;
  const hits = items.filter((i) => CONCERN_KEYWORDS.some((k) => i.title.toLowerCase().includes(k))).length;
  return clamp(hits / items.length, 0, 1);
}
