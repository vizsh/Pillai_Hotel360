import { NextResponse } from "next/server";

/** Real-World Social Signal Integration (HackCelestial midnight task, mandatory requirement 3):
 * public, no-login-required sources only — this is a hackathon demo, not a service with a
 * production social-listening contract. Two sources, combined, because either can fail
 * independently and the other should still carry the feature:
 *
 * 1. Reddit's own public search JSON endpoint — no API key, no OAuth, genuinely real posts.
 *    Requires a real User-Agent (Reddit blocks the default fetch UA) and is rate-limited
 *    unpredictably for anonymous requests, hence the cache and the soft failure.
 * 2. GNews (https://gnews.io) — only if GNEWS_API_KEY is set (free tier signup required);
 *    skipped entirely, not faked, when unset.
 *
 * X/Twitter's API was deliberately NOT used here — its search endpoint now requires a paid
 * tier, not something obtainable free in a hackathon's time budget. */

const QUERY = "Goa monsoon rain flooding tourists";
const REDDIT_URL = `https://www.reddit.com/search.json?q=${encodeURIComponent(QUERY)}&sort=new&limit=8`;
const GNEWS_URL = (key: string) => `https://gnews.io/api/v4/search?q=${encodeURIComponent(QUERY)}&lang=en&max=8&apikey=${key}`;

export interface SocialSignalItem {
  id: string;
  source: "reddit" | "news";
  title: string;
  url: string;
  publishedAt: number;
}

const CACHE_TTL_MS = 20 * 60 * 1000;
let cache: { items: SocialSignalItem[]; fetchedAt: number; sources: { reddit: boolean; news: boolean } } | null = null;

async function fetchReddit(): Promise<SocialSignalItem[]> {
  const res = await fetch(REDDIT_URL, { headers: { "User-Agent": "smart-resort-360-hackcelestial-demo/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`reddit ${res.status}`);
  const data = (await res.json()) as { data?: { children?: { data: { id: string; title: string; permalink: string; created_utc: number } }[] } };
  return (data.data?.children ?? []).map((c) => ({ id: `reddit-${c.data.id}`, source: "reddit" as const, title: c.data.title, url: `https://reddit.com${c.data.permalink}`, publishedAt: c.data.created_utc * 1000 }));
}

async function fetchGNews(key: string): Promise<SocialSignalItem[]> {
  const res = await fetch(GNEWS_URL(key), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`gnews ${res.status}`);
  const data = (await res.json()) as { articles?: { title: string; url: string; publishedAt: string }[] };
  return (data.articles ?? []).map((a, i) => ({ id: `news-${i}-${a.url}`, source: "news" as const, title: a.title, url: a.url, publishedAt: Date.parse(a.publishedAt) || Date.now() }));
}

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, items: cache.items, cached: true, sources: cache.sources, fetchedAt: cache.fetchedAt });
  }

  const gnewsKey = process.env.GNEWS_API_KEY;
  const [redditResult, newsResult] = await Promise.allSettled([fetchReddit(), gnewsKey ? fetchGNews(gnewsKey) : Promise.resolve<SocialSignalItem[]>([])]);

  const reddit = redditResult.status === "fulfilled" ? redditResult.value : [];
  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  const items = [...reddit, ...news].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 12);
  const sources = { reddit: redditResult.status === "fulfilled", news: gnewsKey ? newsResult.status === "fulfilled" : false };

  if (!items.length && redditResult.status === "rejected" && (!gnewsKey || newsResult.status === "rejected")) {
    // Both configured sources failed (rate-limited, network, etc.) — fail soft like the weather
    // route: report the reason, don't fabricate a feed.
    return NextResponse.json({ ok: false, reason: "no-live-source-reachable" }, { status: 503 });
  }

  cache = { items, fetchedAt: Date.now(), sources };
  return NextResponse.json({ ok: true, items, cached: false, sources, fetchedAt: cache.fetchedAt });
}
