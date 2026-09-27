"use client";

import { useEffect } from "react";
import { setSocialSignals, setSignalAnalysis } from "@/lib/intelligence/socialSignals";
import type { SocialSignalItem, HazardEvent } from "@/app/api/social-weather-signals/route";

const POLL_INTERVAL_MS = 20 * 60 * 1000;

/** Same shape as useLiveWeather.ts — fetch on mount, poll every 20 minutes, module-scope guard
 * so mounting this from both AnalyticsShell and CommandCenter doesn't start two intervals. */
let started = false;

/** Traveller-impact classification of the fetched posts (Nugen-aligned model when available, rules otherwise). */
async function analyse(items: SocialSignalItem[]) {
  try {
    const res = await fetch("/api/signal-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.slice(0, 12).map((i) => ({ id: i.id, title: i.title, source: i.source })) }) });
    const data = (await res.json()) as { ok: boolean; analysis?: Record<string, import("@/lib/ai/signalIntel").SignalAnalysis>; provider?: string; model?: string };
    setSignalAnalysis(data.ok && data.analysis ? { analysis: data.analysis, provider: data.provider ?? "rules", model: data.model ?? "" } : null);
  } catch {
    setSignalAnalysis(null);
  }
}

async function poll() {
  try {
    const res = await fetch("/api/social-weather-signals", { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; items?: SocialSignalItem[]; hazards?: HazardEvent[]; trendScore?: number | null; sources?: Record<string, boolean> };
    setSocialSignals(data.ok ? { items: data.items ?? [], hazards: data.hazards ?? [], trendScore: data.trendScore ?? null, sources: data.sources ?? {} } : null);
    if (data.ok && data.items?.length) void analyse(data.items);
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
