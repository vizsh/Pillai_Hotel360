"use client";

import { useSim } from "@/store/sim";
import { getSocialSignals, socialSignalsSource, publicConcernScore } from "@/lib/intelligence/socialSignals";
import { cn } from "@/lib/utils";

function timeAgo(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

/** Real-World Social Signal Integration (mandatory requirement 3): every row here is a real
 * post/article fetched live from Reddit's public search (no key) and, if configured, GNews
 * (app/api/social-weather-signals) — nothing here is written by the simulator. The concern
 * score is a coarse keyword hit-rate over these exact titles (lib/intelligence/socialSignals.ts),
 * not a separate invented number, and it's the same score that nudges the organic request mix
 * in lib/sim/engine.ts — this feed is an input to the twin, not just a decoration next to it. */
export function SocialSignalFeed() {
  useSim((s) => s.version); // re-render on the sim's own poll tick, same as any live-data card
  const items = getSocialSignals();
  const live = socialSignalsSource() === "live";
  const concern = publicConcernScore();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stroke bg-deep/70 p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-[14.5px] font-semibold text-hi">Live traveler &amp; public signal</span>
        <span className={cn("mono rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider", live ? "bg-positive/15 text-positive" : "bg-white/5 text-low")}>{live ? "live · reddit + gnews" : "no live source reachable"}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-mid">Real public posts/articles mentioning weather conditions in the resort&rsquo;s region — feeds a coarse &ldquo;public concern&rdquo; score that nudges the twin&rsquo;s own request mix (a higher concern reading shifts demand further toward front-desk/complaint-leaning requests, on top of the base weather effect).</p>

      {!live && <p className="rounded-lg border border-stroke bg-white/[0.02] p-3 text-center text-[11px] text-low">Reddit/GNews unreachable right now — showing nothing rather than fabricating posts. Retries automatically every 20 minutes.</p>}

      {live && (
        <div className="flex items-center justify-between rounded-lg border border-warm/30 bg-warm/5 px-3 py-2">
          <span className="text-[11px] text-hi">Public concern score</span>
          <span className="mono text-[13px] font-medium text-warm">{(concern * 100).toFixed(0)}%</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="scrollbar-thin flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
          {items.map((it) => (
            <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-2 rounded-lg border border-stroke bg-white/[0.015] px-3 py-2 hover:border-white/20">
              <div className="min-w-0">
                <div className="truncate text-[11.5px] text-hi">{it.title}</div>
                <div className="mono mt-0.5 text-[9.5px] text-low">
                  {it.source} · {timeAgo(it.publishedAt)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
