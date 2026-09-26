import { NextResponse } from "next/server";

/** Real weather adapter — Open-Meteo, no API key required, CORS-open, free for non-commercial
 * use. This is the one external integration point named in the project's own methodology as
 * "the easy swap" (no PMS/IoT/POS access needed, unlike every other adapter this project would
 * need in a real deployment) — see README's "Real weather adapter" section for why this one
 * specifically was built for real rather than left simulated.
 *
 * Coordinates are Goa, India (15.2993°N, 74.1240°E) — a stand-in for "Azure Bay Resort"'s
 * assumed coastal location, matching the project's ₹/beach-resort setting. A real deployment
 * points this at the actual property's coordinates; nothing else about the integration changes. */
const LAT = 15.2993;
const LON = 74.124;
const OPEN_METEO_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=7`;

export interface LiveWeatherDay {
  dayOffset: number;
  tempC: number;
  rainProbability: number;
}

interface OpenMeteoResponse {
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    precipitation_probability_max: number[];
  };
}

/** Cached at module scope, not per-request — Open-Meteo's own update cadence is hourly at
 * best, so refetching on every client poll would be pure waste. 20 minutes balances "feels
 * live" against not hammering a free public API from every open tab. */
let cache: { days: LiveWeatherDay[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 20 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, days: cache.days, cached: true, fetchedAt: cache.fetchedAt });
  }

  try {
    const res = await fetch(OPEN_METEO_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ ok: false, reason: "upstream-error" }, { status: 502 });
    const data = (await res.json()) as OpenMeteoResponse;
    if (!data.daily?.time?.length) return NextResponse.json({ ok: false, reason: "no-data" }, { status: 502 });

    const days: LiveWeatherDay[] = data.daily.time.map((_, i) => ({
      dayOffset: i,
      tempC: Math.round(data.daily!.temperature_2m_max[i]),
      rainProbability: Math.max(0, Math.min(1, data.daily!.precipitation_probability_max[i] / 100)),
    }));
    cache = { days, fetchedAt: Date.now() };
    return NextResponse.json({ ok: true, days, cached: false, fetchedAt: cache.fetchedAt });
  } catch {
    // Fails soft, same convention as lib/ai/ollama.ts — a guest on a flaky network or an
    // Open-Meteo outage should degrade to the simulated forecast, never break the page.
    return NextResponse.json({ ok: false, reason: "network-error" }, { status: 503 });
  }
}
