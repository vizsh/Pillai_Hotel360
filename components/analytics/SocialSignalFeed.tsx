"use client";

import { useMemo } from "react";
import { Newspaper, Rss, MessageCircle, AtSign, ShieldAlert, TrendingUp, Plane } from "lucide-react";
import { useSim } from "@/store/sim";
import { getSocialSignals, getHazardEvents, getTrendScore, getSignalSources, socialSignalsSource, publicConcernScore, getSignalAnalysis, disruptionScore, socialTriggerState, getAviationActivity } from "@/lib/intelligence/socialSignals";
import type { SignalSource } from "@/app/api/social-weather-signals/route";
import { cn } from "@/lib/utils";

function timeAgo(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

const SOURCE_META: Record<SignalSource, { label: string; icon: typeof Rss; color: string }> = {
  reddit: { label: "Reddit", icon: Rss, color: "#ff5700" },
  bluesky: { label: "Bluesky", icon: AtSign, color: "#1185fe" },
  mastodon: { label: "Mastodon", icon: MessageCircle, color: "#6364ff" },
  newsapi: { label: "NewsAPI", icon: Newspaper, color: "#2dd4bf" },
  gnews: { label: "GNews", icon: Newspaper, color: "#34d399" },
};

const INTENT_META: Record<string, { label: string; color: string }> = {
  cancellation: { label: "cancellation", color: "#f4436c" },
  "delay-disruption": { label: "delay / disruption", color: "#f5a524" },
  flooding: { label: "flooding", color: "#38bdf8" },
  "safety-warning": { label: "safety warning", color: "#f4436c" },
  advisory: { label: "advisory", color: "#a78bfa" },
  "demand-shift": { label: "demand shift", color: "#2dd4bf" },
  positive: { label: "positive", color: "#34d399" },
  irrelevant: { label: "not relevant", color: "#64748b" },
};

const ALERT_COLOR: Record<string, string> = { Red: "#f4436c", Orange: "#f5a524", Green: "#34d399" };

const THEME_KEYWORDS: [string, string[]][] = [
  ["flood", ["flood", "waterlog", "landslide"]],
  ["storm", ["storm", "cyclone", "monsoon", "rain"]],
  ["heat", ["heatwave", "heat wave", "hot"]],
  ["travel", ["flight", "airport", "travel", "tourist", "cancel"]],
];
function themeOf(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [theme, kws] of THEME_KEYWORDS) if (kws.some((k) => lower.includes(k))) return theme;
  return null;
}

/** Real-World Social Signal Integration (mandatory requirement 3): every row/pill here is a
 * real post/article/official-alert fetched live (app/api/social-weather-signals) — seven
 * independent sources, each shown honestly as live or not-reachable rather than blended into
 * one status flag. The concern gauge and the request-mix nudge in lib/sim/engine.ts read the
 * exact same blended score computed in lib/intelligence/socialSignals.ts. */
export function SocialSignalFeed() {
  useSim((s) => s.version); // re-render on the sim's own poll tick, same as any live-data card
  const items = getSocialSignals();
  const hazards = getHazardEvents();
  const trendScore = getTrendScore();
  const sources = getSignalSources();
  const live = socialSignalsSource() === "live";
  const concern = publicConcernScore();
  const analysis = getSignalAnalysis();
  const disruption = disruptionScore();
  const trigger = socialTriggerState();
  const aviation = getAviationActivity();

  const gaugeColor = concern > 0.6 ? "#f4436c" : concern > 0.3 ? "#f5a524" : "#34d399";
  const circumference = 2 * Math.PI * 26;
  const dash = circumference * concern;

  const tickerItems = useMemo(() => (items.length ? [...items, ...items] : []), [items]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-stroke bg-deep/70 p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-[14.5px] font-semibold text-hi">Live traveler &amp; public signal</span>
        <span className={cn("mono rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider", live ? "bg-positive/15 text-positive" : "bg-white/5 text-low")}>{live ? "live" : "no live source"}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
            <circle cx={32} cy={32} r={26} fill="none" stroke="#1c232e" strokeWidth={5} />
            <circle cx={32} cy={32} r={26} fill="none" stroke={gaugeColor} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span className="mono text-[13px] font-semibold text-hi">{(concern * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-mid">Public concern — blends live post/article keyword rate, any open official hazard alert, and Google Trends search interest.</span>
          {trendScore !== null && (
            <span className="mono flex items-center gap-1 text-[10px] text-low">
              <TrendingUp size={11} /> Search interest: {trendScore}/100 (Google Trends, Goa region)
            </span>
          )}
        </div>
      </div>

      {trigger.triggered && (
        <div className="flex items-center gap-2 rounded-lg border border-[#f4436c]/40 bg-[#f4436c]/10 px-3 py-2">
          <ShieldAlert size={14} className="text-[#f4436c]" />
          <span className="text-[11px] leading-relaxed text-hi">
            <b>Trigger fired:</b> disruption chatter burst +{Math.round(trigger.burstRate * 100)} pts, corroborated by {trigger.corroboratingProviders} official agenc{trigger.corroboratingProviders === 1 ? "y" : "ies"} — a recommendation is queued on the Command Center.
          </span>
        </div>
      )}
      {analysis && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stroke bg-white/[0.02] px-3 py-2">
          <span className="mono text-[9.5px] uppercase tracking-wider text-low">Traveller-impact reading</span>
          <span className={cn("mono rounded px-1.5 py-0.5 text-[9.5px]", analysis.provider === "rules" ? "bg-white/[0.06] text-mid" : "bg-accent/20 text-accent")}>
            {analysis.provider === "nugen" ? "Nugen-aligned model" : analysis.provider === "ollama" ? "Ollama (fallback)" : analysis.provider === "hosted" ? "hosted model" : "rule-based classifier"}
          </span>
          <span className="mono ml-auto text-[10.5px] text-mid">
            disruption <span className={cn("font-semibold", disruption > 0.5 ? "text-critical" : disruption > 0.25 ? "text-warm" : "text-positive")}>{(disruption * 100).toFixed(0)}%</span> → feeds the twin&rsquo;s complaint and front-desk load
          </span>
        </div>
      )}

      {aviation && (
        <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", aviation.belowNormal ? "border-[#f5a524]/40 bg-[#f5a524]/10" : "border-stroke bg-white/[0.02]")}>
          <Plane size={13} className={aviation.belowNormal ? "text-[#f5a524]" : "text-mid"} />
          <span className="text-[11px] text-mid">
            <b className={aviation.belowNormal ? "text-[#f5a524]" : "text-hi"}>{aviation.aircraftNearby} aircraft</b> live over the regional airports (OpenSky, no key) — {aviation.belowNormal ? "well below normal, consistent with disrupted air travel" : "normal traffic"}.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SOURCE_META) as SignalSource[]).map((s) => (
          <span key={s} className={cn("mono flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px]", sources[s] ? "bg-positive/10 text-positive" : "bg-white/[0.03] text-low")}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sources[s] ? SOURCE_META[s].color : "#3a4150" }} />
            {SOURCE_META[s].label}
          </span>
        ))}
        <span className={cn("mono flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px]", sources.gdacs ? "bg-positive/10 text-positive" : "bg-white/[0.03] text-low")}>
          <ShieldAlert size={10} /> GDACS
        </span>
        <span className={cn("mono flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px]", sources.trends ? "bg-positive/10 text-positive" : "bg-white/[0.03] text-low")}>
          <TrendingUp size={10} /> Trends
        </span>
      </div>

      {hazards.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-warm/30 bg-warm/5 p-2.5">
          <span className="mono flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warm">
            <ShieldAlert size={12} /> Official hazard alerts (GDACS)
          </span>
          {hazards.slice(0, 3).map((h) => (
            <a key={h.id} href={h.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-1.5 hover:bg-black/30">
              <span className="truncate text-[11px] text-hi">{h.name}</span>
              <span className="mono shrink-0 rounded px-1.5 py-0.5 text-[9px]" style={{ background: `${ALERT_COLOR[h.alertLevel] ?? "#7a8494"}22`, color: ALERT_COLOR[h.alertLevel] ?? "#7a8494" }}>
                {h.alertLevel}
              </span>
            </a>
          ))}
        </div>
      )}

      {!live && items.length === 0 && hazards.length === 0 && <p className="rounded-lg border border-stroke bg-white/[0.02] p-3 text-center text-[11px] text-low">No live source reachable right now — showing nothing rather than fabricating posts. Retries automatically every 20 minutes.</p>}

      {tickerItems.length > 0 && (
        <div className="group relative overflow-hidden rounded-lg border border-stroke bg-black/20 py-1.5">
          <div className="ticker-track flex w-max gap-8 whitespace-nowrap px-3 group-hover:[animation-play-state:paused]">
            {tickerItems.map((it, i) => {
              const meta = SOURCE_META[it.source];
              const Icon = meta.icon;
              return (
                <span key={`${it.id}-${i}`} className="flex items-center gap-1.5 text-[11px] text-mid">
                  <Icon size={11} color={meta.color} />
                  {it.title}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="scrollbar-thin flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
          {items.map((it) => {
            const meta = SOURCE_META[it.source];
            const Icon = meta.icon;
            const theme = themeOf(it.title);
            return (
              <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-2 rounded-lg border border-stroke bg-white/[0.015] px-3 py-2 hover:border-white/20">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] text-hi">{it.title}</div>
                  <div className="mono mt-0.5 flex items-center gap-1.5 text-[9.5px] text-low">
                    <Icon size={10} color={meta.color} />
                    {meta.label} · {timeAgo(it.publishedAt)}
                    {theme && <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[8.5px] uppercase tracking-wider text-mid">{theme}</span>}
                    {analysis?.byId[it.id] && (
                      <>
                        <span className="rounded px-1 py-0.5 text-[8.5px] uppercase tracking-wider" style={{ background: `${INTENT_META[analysis.byId[it.id].intent].color}22`, color: INTENT_META[analysis.byId[it.id].intent].color }}>
                          {INTENT_META[analysis.byId[it.id].intent].label} · {(analysis.byId[it.id].urgency * 100).toFixed(0)}
                        </span>
                        {analysis.byId[it.id].location && <span className="text-mid">@ {analysis.byId[it.id].location}</span>}
                      </>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <style>{`
        .ticker-track { animation: ticker-scroll 28s linear infinite; }
        @keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
    </div>
  );
}
