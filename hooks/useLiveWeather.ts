"use client";

import { useEffect } from "react";
import { setLiveWeather } from "@/lib/intelligence/weather";
import type { LiveWeatherDay } from "@/app/api/weather/route";

const POLL_INTERVAL_MS = 20 * 60 * 1000;

/** "Automate" the weather adapter: no manual refresh button — fetches on mount and every 20
 * minutes after, same cadence as the server route's own cache TTL, so a poll is never wasted
 * on data that couldn't have changed. Guarded at module scope, not per-mount, because this
 * hook is called from both AnalyticsShell and CommandCenter (the same duplication pattern
 * already used for useSimLoop/useTelegramInbox in this codebase, so those two shells stay
 * consistent) — without the guard, having both mounted would start two redundant intervals. */
let started = false;

async function poll() {
  try {
    const res = await fetch("/api/weather", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; days?: LiveWeatherDay[] };
    setLiveWeather(data.ok && data.days ? data.days : null);
  } catch {
    setLiveWeather(null);
  }
}

export function useLiveWeather() {
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
