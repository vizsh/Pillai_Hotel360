"use client";

import { useEffect } from "react";
import { setSocialSignals } from "@/lib/intelligence/socialSignals";
import type { SocialSignalItem, HazardEvent } from "@/app/api/social-weather-signals/route";

const POLL_INTERVAL_MS = 20 * 60 * 1000;

/** Same shape as useLiveWeather.ts — fetch on mount, poll every 20 minutes, module-scope guard
 * so mounting this from both AnalyticsShell and CommandCenter doesn't start two intervals. */
let started = false;

async function poll() {
  try {
    const res = await fetch("/api/social-weather-signals", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; items?: SocialSignalItem[]; hazards?: HazardEvent[]; trendScore?: number | null; sources?: Record<string, boolean> };
    setSocialSignals(data.ok ? { items: data.items ?? [], hazards: data.hazards ?? [], trendScore: data.trendScore ?? null, sources: data.sources ?? {} } : null);
  } catch {
    setSocialSignals(null);
  }
}

export function useSocialWeatherSignals() {
  useEffect(() => {
    if (started) return;
    started = true;
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      started = false;
    };
  }, []);
}
