"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { computePricing, computeSegmentPricing } from "@/lib/intelligence/pricing";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { AnalyticsShell, Card, chartTheme } from "./AnalyticsShell";
import { Button, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { cn, fmtINR, fmtPct } from "@/lib/utils";
import { fmtClock } from "@/lib/sim/engine";

export function RevenuePage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const p = computePricing(state, model);
  const segRates = computeSegmentPricing(state, model);
  const rec = state.recommendations["rec-price-bar"];
  const hist = state.kpiHistory.slice(-96).map((h) => ({ t: fmtClock(h.t).slice(3), occ: +(h.occupancy * 100).toFixed(1), adr: Math.round(h.adr), revpar: Math.round(h.revpar) }));
  const byType = ["standard", "deluxe", "suite", "accessible"].map((type) => {
    const rooms = model.rooms.filter((r) => r.type === type);
    const rs = rooms.map((r) => state.rooms[r.id]);
    const occ = rs.filter((r) => r.guestId).length / Math.max(1, rs.length);
    const adr = rs.length ? rs.reduce((s, r) => s + r.rate, 0) / rs.length : 0;
    return { type, rooms: rooms.length, occ, adr, revpar: adr * occ, rev7d: rs.reduce((s, r) => s + r.revenue7d, 0) };
  });
  const byFloor = model.floors.filter((f) => f.kind === "guest").map((f) => ({ floor: `F${f.index}`, rev: Math.round(f.rooms.reduce((s, r) => s + state.rooms[r.id].revenue7d, 0) / 1000), sea: Math.round(f.rooms.filter((r) => r.seaView).reduce((s, r) => s + state.rooms[r.id].revenue7d, 0) / 1000) }));

  return (
    <AnalyticsShell title="Revenue Studio" subtitle="Dynamic pricing on a constant-elasticity demand curve, with pacing, seasonality and competitor index as inputs. Accepting a rate writes it back into the twin.">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="Occupancy" value={fmtPct(state.kpis.occupancy)} />
        <Stat label="ADR" value={fmtINR(state.kpis.adr)} />
        <Stat label="RevPAR" value={fmtINR(state.kpis.revpar)} />
        <Stat label="Rate multiplier" value={`${state.rateMultiplier.toFixed(2)}×`} sub={`base ${fmtINR(state.baseRate)}`} />
        <Stat label="Revenue today" value={fmtINR(state.kpis.revenueToday)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="RevPAR optimisation curve" right={<Provenance kind="modeled" />} className="col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={p.curve.map((c) => ({ mult: c.mult, revpar: Math.round(c.revpar), occ: +(c.occ * 100).toFixed(1) }))}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" />
              <XAxis dataKey="mult" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <YAxis yAxisId="l" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="r" orientation="right" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <ReferenceLine yAxisId="l" x={p.currentMultiplier} stroke="#9aa7b8" strokeDasharray="3 3" label={{ value: "current", fill: "#9aa7b8", fontSize: 10, position: "top" }} />
              <ReferenceLine yAxisId="l" x={p.recommendedMultiplier} stroke="#2dd4bf" label={{ value: "optimum", fill: "#2dd4bf", fontSize: 10, position: "top" }} />
              <Line yAxisId="l" type="monotone" dataKey="revpar" stroke="#2dd4bf" strokeWidth={2} dot={false} name="RevPAR" />
              <Line yAxisId="r" type="monotone" dataKey="occ" stroke="#f5a524" strokeWidth={1.5} dot={false} name="Occupancy %" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Recommendation" right={rec ? <Tag color="#2dd4bf">{rec.status}</Tag> : <Tag>at optimum</Tag>}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current ADR" value={fmtINR(p.currentAdr)} sub={`RevPAR ${fmtINR(p.currentRevpar)}`} />
              <Stat label="Recommended" value={fmtINR(p.recommendedAdr)} accent="var(--accent)" sub={`RevPAR ${fmtINR(p.projectedRevpar)}`} />
            </div>
            <div className="mono flex flex-col gap-1 rounded-lg border border-stroke bg-white/[0.02] p-3 text-[11px] text-low">
              <div className="flex justify-between"><span>seasonality</span><span className="text-hi">{p.inputs.seasonality.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>pacing (48h)</span><span className="text-hi">{p.inputs.pacing >= 0 ? "+" : ""}{(p.inputs.pacing * 100).toFixed(1)} pts</span></div>
              <div className="flex justify-between"><span>competitor index</span><span className="text-hi">{p.inputs.competitorIndex.toFixed(2)}</span></div>
              <div className="flex justify-between">
                <span>elasticity</span>
                <span className="text-hi">
                  {p.inputs.elasticity.toFixed(2)} <span className="text-low">({p.inputs.elasticitySource === "segment-blend" ? "segment blend" : "default"})</span>
                </span>
              </div>
              <div className="flex justify-between"><span>event uplift</span><span className="text-hi">+{(p.inputs.eventUplift * 100).toFixed(0)}%</span></div>
            </div>
            {rec?.status === "pending" ? (
              <Button variant="primary" onClick={() => acceptRecommendation(mutate, model, rec)}>
                Apply {p.recommendedMultiplier.toFixed(2)}× to unsold inventory
              </Button>
            ) : (
              <p className="text-[11.5px] text-low">{rec ? `Applied ${fmtClock(rec.createdAt)}. The model re-evaluates every 30 simulated minutes.` : "Current rate is within 4% of the modeled optimum."}</p>
            )}
          </div>
        </Card>
      </div>

      {segRates.length > 0 && (
        <Card title="Pricing by segment" right={<Provenance kind="modeled" />}>
          <p className="mb-3 text-[11.5px] text-mid">
            What each guest segment&apos;s own price sensitivity would support, holding today&rsquo;s seasonality and competitor index fixed. The blended elasticity above (
            {p.inputs.elasticity.toFixed(2)}) is these segments weighted by in-house guest count — segmentation output drives the resort-wide rate, not just this table.
          </p>
          <table className="w-full text-[12px]">
            <thead className="label text-left">
              <tr>
                <th className="pb-2 font-normal">Segment</th>
                <th className="pb-2 font-normal">In-house</th>
                <th className="pb-2 font-normal">Elasticity</th>
                <th className="pb-2 font-normal">Would support</th>
                <th className="pb-2 font-normal">vs. current BAR</th>
                <th className="pb-2 font-normal">RevPAR delta</th>
              </tr>
            </thead>
            <tbody className="mono">
              {segRates.map((s) => {
                const deltaPct = (s.recommendedAdr - s.currentAdr) / s.currentAdr;
                return (
                  <tr key={s.cluster.id} className="border-t border-stroke/60">
                    <td className="py-2">
                      <span className="flex items-center gap-2 text-hi">
                        <span className="h-2 w-2 rounded-sm" style={{ background: s.cluster.color }} />
                        {s.cluster.name}
                      </span>
                    </td>
                    <td className="py-2 text-mid">{s.cluster.size}</td>
                    <td className="py-2 text-mid">{s.elasticity.toFixed(2)}</td>
                    <td className="py-2 text-hi">{fmtINR(s.recommendedAdr)}</td>
                    <td className={cn("py-2", deltaPct >= 0 ? "text-positive" : "text-critical")}>
                      {deltaPct >= 0 ? "+" : ""}
                      {(deltaPct * 100).toFixed(1)}%
                    </td>
                    <td className={cn("py-2", s.revparDelta >= 0 ? "text-positive" : "text-critical")}>
                      {s.revparDelta >= 0 ? "+" : ""}
                      {fmtINR(s.revparDelta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card title="Occupancy · ADR · RevPAR (hourly)" className="col-span-2" right={<Provenance />}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={hist}>
              <defs>
                <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" />
              <XAxis dataKey="t" stroke={chartTheme.axis} fontSize={10} minTickGap={40} />
              <YAxis yAxisId="l" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="r" orientation="right" stroke={chartTheme.axis} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <Area yAxisId="l" type="monotone" dataKey="revpar" stroke="#2dd4bf" fill="url(#g1)" strokeWidth={2} name="RevPAR" />
              <Line yAxisId="l" type="monotone" dataKey="adr" stroke="#c084fc" dot={false} name="ADR" />
              <Line yAxisId="r" type="monotone" dataKey="occ" stroke="#f5a524" dot={false} name="Occ %" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="7-day revenue by floor (₹k)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byFloor} layout="vertical" barCategoryGap={4}>
              <XAxis type="number" stroke={chartTheme.axis} fontSize={10} />
              <YAxis type="category" dataKey="floor" stroke={chartTheme.axis} fontSize={10} width={28} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <Bar dataKey="rev" name="total" fill="#146e6a" radius={3} />
              <Bar dataKey="sea" name="sea view" fill="#2dd4bf" radius={3} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Performance by room type">
        <table className="w-full text-[12px]">
          <thead className="label text-left">
            <tr>
              <th className="pb-2 font-normal">Type</th>
              <th className="pb-2 font-normal">Rooms</th>
              <th className="pb-2 font-normal">Occupancy</th>
              <th className="pb-2 font-normal">ADR</th>
              <th className="pb-2 font-normal">RevPAR</th>
              <th className="pb-2 font-normal">7d revenue</th>
              <th className="pb-2 font-normal">Share</th>
            </tr>
          </thead>
          <tbody className="mono">
            {byType.map((r) => {
              const total = byType.reduce((s, x) => s + x.rev7d, 0);
              return (
                <tr key={r.type} className="border-t border-stroke/60">
                  <td className="py-2 capitalize text-hi">{r.type}</td>
                  <td className="py-2 text-mid">{r.rooms}</td>
                  <td className="py-2 text-mid">{fmtPct(r.occ)}</td>
                  <td className="py-2 text-mid">{fmtINR(r.adr)}</td>
                  <td className="py-2 text-hi">{fmtINR(r.revpar)}</td>
                  <td className="py-2 text-mid">{fmtINR(r.rev7d)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-32 rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(r.rev7d / Math.max(1, total)) * 100}%` }} />
                      </div>
                      <span className="text-low">{fmtPct(r.rev7d / Math.max(1, total), 0)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </AnalyticsShell>
  );
}
