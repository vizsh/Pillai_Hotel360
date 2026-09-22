"use client";

import Link from "next/link";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from "recharts";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { segmentGuests, guestVector, featureNames } from "@/lib/intelligence/segmentation";
import { nextBestActions } from "@/lib/intelligence/personalization";
import { applyNextBestAction } from "@/lib/sim/actions";
import { AnalyticsShell, Card, chartTheme } from "./AnalyticsShell";
import { Button, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { fmtINR, cn } from "@/lib/utils";
import { pushFeed } from "@/lib/sim/engine";

export function GuestsPage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const clusters = segmentGuests(state, model);
  const guests = Object.values(state.guests).filter((g) => g.roomId);
  const clusterOf = new Map<string, number>();
  clusters.forEach((c) => c.members.forEach((m) => clusterOf.set(m, c.id)));
  const scatter = guests.map((g) => {
    const v = guestVector(g);
    return { id: g.id, name: g.name, spend: Math.round(v[0]), nights: v[1], lead: v[2], party: v[3], cluster: clusterOf.get(g.id) ?? 0, room: model.roomById.get(g.roomId!)?.number };
  });
  const nbas = guests
    .map((g) => ({ g, a: nextBestActions(g, state, model)[0] }))
    .sort((x, y) => y.a.score - x.a.score)
    .slice(0, 12);
  const segCounts = ["leisure-couple", "family", "business", "luxury", "group"].map((s) => ({ s, n: guests.filter((g) => g.segment === s).length }));

  return (
    <AnalyticsShell title="Guest Intelligence" subtitle="k-means behavioral segmentation over in-house guests, with a per-guest next-best-action ranking derived from preferences, loyalty and stay stage.">
      <div className="grid grid-cols-6 gap-4">
        <Stat label="In-house guests" value={String(guests.length)} />
        <Stat label="VIP" value={String(guests.filter((g) => g.vip).length)} />
        <Stat label="Avg sentiment" value={(guests.reduce((s, g) => s + g.sentiment, 0) / Math.max(1, guests.length)).toFixed(2)} />
        <Stat label="At-risk (< −0.2)" value={String(guests.filter((g) => g.sentiment < -0.2).length)} accent="var(--critical)" />
        <Stat label="Avg spend / guest" value={fmtINR(guests.reduce((s, g) => s + g.spendRoom + g.spendFnb + g.spendSpa + g.spendOther, 0) / Math.max(1, guests.length))} />
        <Stat label="Ancillary revenue today" value={fmtINR(state.kpis.ancillaryRevenueToday)} sub="from accepted NBAs" accent="var(--positive)" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="Segments · spend/night vs lead time" right={<Provenance kind="modeled" module="segmentation" />} className="col-span-2">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" />
              <XAxis dataKey="lead" type="number" name="lead days" stroke={chartTheme.axis} fontSize={10} label={{ value: "lead days", fill: "#5b6879", fontSize: 10, position: "insideBottomRight", dy: 10 }} />
              <YAxis dataKey="spend" type="number" name="spend/night" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <ZAxis dataKey="nights" range={[30, 220]} name="nights" />
              <Tooltip contentStyle={chartTheme.tooltip} cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [n === "spend/night" ? fmtINR(Number(v)) : String(v), String(n)]} labelFormatter={() => ""} />
              <Scatter
                data={scatter}
                onClick={(d) => {
                  const id = (d as { payload?: { id?: string } })?.payload?.id;
                  if (id) useTwin.getState().select({ kind: "guest", id });
                }}
              >
                {scatter.map((s) => (
                  <Cell key={s.id} fill={clusters[s.cluster]?.color ?? "#fff"} fillOpacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="mono mt-1 text-[10px] text-low">features: {featureNames.join(" · ")} — min-max normalised, k=5, k-means++ initialisation</p>
        </Card>
        <Card title="Booking segment mix">
          <div className="flex flex-col gap-2">
            {segCounts.map((s) => (
              <div key={s.s} className="flex items-center gap-2">
                <span className="w-28 text-[11.5px] capitalize text-mid">{s.s.replace("-", " ")}</span>
                <div className="h-2 flex-1 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${(s.n / Math.max(1, guests.length)) * 100}%` }} />
                </div>
                <span className="mono w-6 text-right text-[11px] text-hi">{s.n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {clusters.map((c) => (
          <Card key={c.id} className="border-t-2" >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-hi">{c.name}</span>
              <span className="mono text-[11px]" style={{ color: c.color }}>{c.size}</span>
            </div>
            <div className="mono mt-2 grid grid-cols-2 gap-1 text-[10.5px] text-low">
              <span>spend/n</span><span className="text-right text-hi">{fmtINR(c.avgSpend)}</span>
              <span>nights</span><span className="text-right text-hi">{c.avgNights.toFixed(1)}</span>
              <span>lead</span><span className="text-right text-hi">{c.avgLead.toFixed(0)}d</span>
              <span>sentiment</span><span className={cn("text-right", c.avgSentiment < 0 ? "text-critical" : "text-positive")}>{c.avgSentiment >= 0 ? "+" : ""}{c.avgSentiment.toFixed(2)}</span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-mid">{c.offer}</p>
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => mutate((s) => { for (const id of c.members) { const g = s.guests[id]; if (g) { g.sentiment = Math.min(1, g.sentiment + 0.1); if (g.roomId) s.rooms[g.roomId].sentiment = g.sentiment; } } pushFeed(s, "task", `Offer pushed to ${c.name} (${c.size} guests)`, "resort", "segment"); })}>
              Push offer
            </Button>
          </Card>
        ))}
      </div>

      <Card title="Next best actions · top ranked" right={<Tag color="#34d399">NBA</Tag>}>
        <div className="grid grid-cols-2 gap-2">
          {nbas.map(({ g, a }) => (
            <div key={g.id} className="flex items-center gap-3 rounded-lg border border-stroke bg-white/[0.02] px-3 py-2">
              <div className="mono w-10 text-[14px] text-positive">{a.score.toFixed(2)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px] text-hi">
                  <Link href="/command" onClick={() => useTwin.getState().select({ kind: "room", id: g.roomId! })} className="hover:text-accent">
                    {g.name} · {model.roomById.get(g.roomId!)?.number}
                  </Link>
                  {g.vip && <Tag color="#f5d26b">VIP</Tag>}
                </div>
                <div className="truncate text-[11px] text-mid">{a.label}</div>
                <div className="truncate text-[10px] text-low">
                  {a.reason}
                  {a.revenueUplift > 0 && <span className="text-positive"> · +{fmtINR(a.revenueUplift)}</span>}
                </div>
              </div>
              <Button size="sm" variant="subtle" onClick={() => mutate((s) => applyNextBestAction(s, model, g.id, a))}>
                Do it
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </AnalyticsShell>
  );
}
