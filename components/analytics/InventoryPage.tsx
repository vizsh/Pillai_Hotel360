"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { assessInventory } from "@/lib/intelligence/inventory";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { AnalyticsShell, Card, chartTheme } from "./AnalyticsShell";
import { Button, Meter, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { cn, fmtINR } from "@/lib/utils";
import { useState } from "react";

export function InventoryPage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const occFactor = state.kpis.occupancy / 0.85;
  const items = Object.values(state.inventory).map((it) => ({ it, a: assessInventory(it, occFactor) })).sort((x, y) => x.a.daysCover - y.a.daysCover);
  const [sel, setSel] = useState(items[0].it.id);
  const cur = items.find((x) => x.it.id === sel) ?? items[0];
  const proj = (() => {
    let stock = cur.it.stock;
    const out = [{ d: 0, stock: Math.round(stock), fc: null as number | null }];
    for (let d = 1; d <= 7; d++) {
      stock -= cur.a.forecast.next7[d - 1] * (0.7 + occFactor * 0.3);
      if (cur.it.orderEta && state.t + d * 1440 >= cur.it.orderEta && state.t + (d - 1) * 1440 < cur.it.orderEta) stock += cur.it.onOrder;
      out.push({ d, stock: Math.round(Math.max(0, stock)), fc: Math.round(cur.a.forecast.next7[d - 1]) });
    }
    return out;
  })();
  const value = items.reduce((s, x) => s + x.it.stock * x.it.unitCost, 0);

  return (
    <AnalyticsShell title="Inventory Optimization" subtitle="Holt linear-trend forecasting on daily consumption, reorder points with 1.65σ safety stock over lead time, EOQ order sizing. Purchase orders arrive into the store zones on the twin.">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="SKUs" value={String(items.length)} />
        <Stat label="Below reorder point" value={String(items.filter((x) => x.it.stock < x.a.reorderPoint).length)} accent="var(--warm)" />
        <Stat label="Stockout ≤ 7d" value={String(items.filter((x) => x.a.stockoutDay !== null).length)} accent="var(--critical)" />
        <Stat label="On order" value={String(items.filter((x) => x.it.onOrder > 0).length)} />
        <Stat label="Stock value" value={fmtINR(value)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title={`7-day projection · ${cur.it.name}`} right={<Provenance kind="modeled" module="inventory" />} className="col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={proj}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" />
              <XAxis dataKey="d" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `+${v}d`} />
              <YAxis stroke={chartTheme.axis} fontSize={10} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <ReferenceLine y={cur.a.reorderPoint} stroke="#f5a524" strokeDasharray="3 3" label={{ value: "reorder point", fill: "#f5a524", fontSize: 10, position: "insideTopRight" }} />
              <ReferenceLine y={0} stroke="#f4436c" />
              <Line type="monotone" dataKey="stock" stroke="#2dd4bf" strokeWidth={2} name={`stock (${cur.it.unit})`} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mono mt-2 grid grid-cols-4 gap-2 text-[10.5px] text-low">
            <div>level <span className="text-hi">{cur.a.forecast.level.toFixed(1)}/d</span></div>
            <div>trend <span className="text-hi">{cur.a.forecast.trend >= 0 ? "+" : ""}{cur.a.forecast.trend.toFixed(2)}/d</span></div>
            <div>σ <span className="text-hi">{cur.a.forecast.sd.toFixed(1)}</span></div>
            <div>EOQ <span className="text-hi">{cur.a.eoq} {cur.it.unit}</span></div>
          </div>
        </Card>
        <Card title="Consumption history · 14d">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cur.it.useHistory.slice(-14).map((v, i) => ({ d: i - 13, v: Math.round(v) }))}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="d" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `${v}d`} />
              <YAxis stroke={chartTheme.axis} fontSize={10} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <Bar dataKey="v" fill="#146e6a" radius={3} name={cur.it.unit} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Stock register">
        <table className="w-full text-[12px]">
          <thead className="label text-left">
            <tr>
              <th className="pb-2 font-normal">Item</th>
              <th className="pb-2 font-normal">Cat</th>
              <th className="pb-2 font-normal">On hand</th>
              <th className="pb-2 font-normal">Cover</th>
              <th className="pb-2 font-normal">Daily use</th>
              <th className="pb-2 font-normal">ROP</th>
              <th className="pb-2 font-normal">Lead</th>
              <th className="pb-2 font-normal">Stockout</th>
              <th className="pb-2 font-normal">On order</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody className="mono">
            {items.map(({ it, a }) => {
              const low = it.stock < a.reorderPoint;
              const rec = state.recommendations[`rec-inv-${it.id}`];
              return (
                <tr key={it.id} onClick={() => setSel(it.id)} className={cn("cursor-pointer border-t border-stroke/60 hover:bg-white/[0.03]", sel === it.id && "bg-accent/5")}>
                  <td className="py-2 text-hi">{it.name}</td>
                  <td className="py-2"><Tag>{it.category}</Tag></td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <Meter value={Math.min(1, it.stock / (a.reorderPoint * 2.5))} color={low ? "var(--warm)" : "var(--accent)"} className="w-16" />
                      <span className={low ? "text-warm" : "text-mid"}>{Math.round(it.stock)} {it.unit}</span>
                    </div>
                  </td>
                  <td className={cn("py-2", a.daysCover < it.leadDays ? "text-critical" : "text-mid")}>{a.daysCover.toFixed(1)}d</td>
                  <td className="py-2 text-mid">{a.forecast.level.toFixed(1)}</td>
                  <td className="py-2 text-mid">{a.reorderPoint}</td>
                  <td className="py-2 text-mid">{it.leadDays}d</td>
                  <td className={cn("py-2", a.stockoutDay ? "text-critical" : "text-low")}>{a.stockoutDay ? `day ${a.stockoutDay}` : "—"}</td>
                  <td className="py-2 text-mid">{it.onOrder ? `${it.onOrder} · ${Math.max(0, Math.ceil(((it.orderEta ?? 0) - state.t) / 1440))}d` : "—"}</td>
                  <td className="py-2 text-right">
                    {rec?.status === "pending" && (
                      <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); acceptRecommendation(mutate, model, rec); }}>
                        Order {rec.payload?.qty as number}
                      </Button>
                    )}
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
