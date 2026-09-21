"use client";

import { useState } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { useTrace } from "@/store/trace";
import { getModel } from "@/lib/architecture/model";
import { aspectSummary, scoreText } from "@/lib/intelligence/sentiment";
import { worstAssetForRoom } from "@/lib/twin/trace";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { fmtClock } from "@/lib/sim/engine";
import { AnalyticsShell, Card, chartTheme } from "./AnalyticsShell";
import { Button, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function SentimentPage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const summary = aspectSummary(state.reviews, state.t);
  const reviews = state.reviews.slice().reverse();
  const [text, setText] = useState("Lovely resort but the AC in our room was noisy at night and the breakfast ran out of eggs.");
  const live = scoreText(text);
  const recs = Object.values(state.recommendations).filter((r) => r.module === "sentiment" && r.status === "pending");
  const dist = [1, 2, 3, 4, 5].map((r) => ({ r: `${r}★`, n: reviews.filter((x) => x.rating === r).length }));
  const floorHeat = model.floors.filter((f) => f.kind === "guest").map((f) => {
    const rs = f.rooms.map((r) => state.rooms[r.id].sentiment).filter((x): x is number => x !== null);
    return { floor: f.index, avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0, n: rs.length };
  });

  return (
    <AnalyticsShell title="Sentiment Analysis" subtitle="Aspect-based scoring with clause-level negation over guest reviews and in-stay signals. Negative aspects are routed to the owning department with a floor-level hotspot.">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="Reviews (7d)" value={String(reviews.filter((r) => state.t - r.createdAt < 7 * 1440).length)} />
        <Stat label="Avg rating" value={reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2) : "—"} />
        <Stat label="GSS blended" value={state.kpis.gss.toFixed(2)} />
        <Stat label="Negative aspects" value={String(summary.filter((a) => a.mentions >= 3 && a.score < -0.2).length)} accent="var(--critical)" />
        <Stat label="In-house < −0.2" value={String(Object.values(state.guests).filter((g) => g.roomId && g.sentiment < -0.2).length)} accent="var(--warm)" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="Aspect scores · trailing 7 days" right={<Provenance kind="derived" />} className="col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary.map((a) => ({ aspect: a.aspect, score: +a.score.toFixed(2), mentions: a.mentions }))} layout="vertical" barCategoryGap={6}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" domain={[-1, 1]} stroke={chartTheme.axis} fontSize={10} />
              <YAxis type="category" dataKey="aspect" stroke={chartTheme.axis} fontSize={10} width={80} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <Bar dataKey="score" radius={3}>
                {summary.map((a) => (
                  <Cell key={a.aspect} fill={a.score < 0 ? "#f4436c" : "#34d399"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mono mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-low">
            {summary.map((a) => (
              <span key={a.aspect}>
                {a.aspect}: {a.mentions} · trend {a.trend >= 0 ? "+" : ""}{a.trend.toFixed(2)}
              </span>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Rating distribution">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={dist}>
                <XAxis dataKey="r" stroke={chartTheme.axis} fontSize={10} />
                <Tooltip contentStyle={chartTheme.tooltip} />
                <Bar dataKey="n" fill="#2dd4bf" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="In-house sentiment by floor">
            <div className="flex items-end gap-1">
              {floorHeat.map((f) => (
                <button key={f.floor} onClick={() => useTwin.getState().setIsolatedFloor(f.floor)} className="flex flex-1 flex-col items-center gap-1" title={`Floor ${f.floor}: ${f.avg.toFixed(2)} (${f.n} guests)`}>
                  <div className="w-full rounded-sm" style={{ height: 40, background: `linear-gradient(180deg, ${f.avg < 0 ? "#f4436c" : "#34d399"}${Math.round(Math.min(1, Math.abs(f.avg) * 2 + 0.15) * 255).toString(16).padStart(2, "0")}, transparent)` }} />
                  <span className="mono text-[10px] text-low">F{f.floor}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="Live scorer · try a review" right={<Tag color="#f472b6">SENT</Tag>}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full resize-none rounded-md border border-stroke bg-transparent p-2 text-[12px] text-hi outline-none focus:border-accent/60" />
          <div className="mt-2 flex items-center justify-between">
            <span className="label">overall</span>
            <span className={cn("mono text-[16px]", live.overall < 0 ? "text-critical" : "text-positive")}>{live.overall >= 0 ? "+" : ""}{live.overall.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {Object.entries(live.aspects).map(([a, s]) => (
              <div key={a} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 capitalize text-mid">{a}</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-white/5">
                  <div className="absolute top-0 h-full rounded-full" style={{ left: s < 0 ? `${50 + s * 50}%` : "50%", width: `${Math.abs(s) * 50}%`, background: s < 0 ? "var(--critical)" : "var(--positive)" }} />
                </div>
                <span className="mono w-10 text-right text-low">{s.toFixed(2)}</span>
              </div>
            ))}
            {Object.keys(live.aspects).length === 0 && <p className="text-[11px] text-low">No aspect keywords detected.</p>}
          </div>
        </Card>
        <Card title="Routing recommendations" className="col-span-2">
          {recs.length === 0 ? (
            <p className="text-[12px] text-low">No aspect currently meets the routing threshold (≥3 mentions, score &lt; −0.2).</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {recs.map((r) => {
                const floor = r.payload?.floor as number | null | undefined;
                const candidate = floor != null ? model.rooms.find((rm) => rm.floor === floor && state.rooms[rm.id].guestId && (state.rooms[rm.id].sentiment ?? 0) < -0.1) : null;
                return (
                  <div key={r.id} className="rounded-lg border border-critical/40 bg-critical/5 p-3">
                    <div className="text-[12.5px] text-hi">{r.title}</div>
                    <p className="mt-1 text-[11px] text-mid">{r.body}</p>
                    <p className="mt-1 text-[10.5px] text-low">{r.action}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="primary" onClick={() => acceptRecommendation(mutate, model, r)}>
                        Open quality action
                      </Button>
                      {candidate && (
                        <Link
                          href="/command"
                          onClick={() => {
                            const w = worstAssetForRoom(model, state, candidate.id);
                            if (w) useTrace.getState().start(candidate.id, w.id);
                          }}
                        >
                          <Button size="sm" variant="outline">
                            <Radar size={12} /> Investigate
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title={`Review stream (${reviews.length})`}>
        <div className="scrollbar-thin grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto">
          {reviews.slice(0, 40).map((r) => (
            <div key={r.id} className="rounded-lg border border-stroke bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <span className="mono text-[12px] text-warm">{"★".repeat(r.rating)}<span className="text-low">{"★".repeat(5 - r.rating)}</span></span>
                <span className="mono text-[10px] text-low">
                  {r.source} · {fmtClock(r.createdAt)} ·{" "}
                  <Link href="/command" onClick={() => useTwin.getState().select({ kind: "room", id: r.roomId })} className="hover:text-accent">
                    {model.roomById.get(r.roomId)?.number}
                  </Link>
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-mid">{r.text}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {Object.entries(r.aspects).map(([a, s]) => (
                  <span key={a} className={cn("rounded px-1.5 py-0.5 text-[10px]", s < 0 ? "bg-critical/10 text-critical" : "bg-positive/10 text-positive")}>
                    {a} {s >= 0 ? "+" : ""}{s.toFixed(1)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AnalyticsShell>
  );
}
