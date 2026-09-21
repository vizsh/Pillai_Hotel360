"use client";

import Link from "next/link";
import { Radar } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { useTrace } from "@/store/trace";
import { getModel } from "@/lib/architecture/model";
import { assessAsset } from "@/lib/intelligence/maintenance";
import { sampleServedRoom } from "@/lib/twin/trace";
import { scheduleService } from "@/lib/sim/engine";
import { triggerFailure } from "@/lib/sim/actions";
import { AnalyticsShell, Card, chartTheme } from "./AnalyticsShell";
import { Button, Meter, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function MaintenancePage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const rows = model.assets
    .map((a) => ({ a, st: state.assets[a.id], res: assessAsset(a.kind, state.assets[a.id]) }))
    .sort((x, y) => y.st.failureProb7d - x.st.failureProb7d);
  const worst = rows[0];
  const survival = (() => {
    const shape: Record<string, number> = { chiller: 2.4, ahu: 2.0, elevator: 2.8, pump: 2.2, boiler: 2.6, generator: 1.9, "kitchen-hood": 1.8, "pool-filter": 2.0 };
    const scale: Record<string, number> = { chiller: 26000, ahu: 32000, elevator: 40000, pump: 18000, boiler: 30000, generator: 22000, "kitchen-hood": 24000, "pool-filter": 20000 };
    const k = shape[worst.a.kind];
    const lam = scale[worst.a.kind];
    const eff = worst.st.runtimeHours / Math.max(0.15, worst.st.health);
    const H = (t: number) => Math.pow(t / lam, k);
    return Array.from({ length: 61 }, (_, d) => {
      const dt = d * 24 * 12;
      const p = 1 - Math.exp(-(H(eff + dt) - H(eff)) * (1 + worst.res.anomaly * 0.6));
      const pBase = 1 - Math.exp(-(H(worst.st.runtimeHours + dt) - H(worst.st.runtimeHours)));
      return { d, p: +(p * 100).toFixed(1), base: +(pBase * 100).toFixed(1) };
    });
  })();
  const openWO = Object.values(state.requests).filter((r) => r.source === "system" && r.type === "maintenance" && r.status !== "done");

  return (
    <AnalyticsShell title="Predictive Maintenance" subtitle="Weibull survival on effective runtime hours (health-adjusted), multiplied by a telemetry anomaly term from temperature and vibration z-scores. Work orders dispatch engineering onto the twin.">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="Monitored assets" value={String(model.assets.length)} />
        <Stat label="Critical (>60%)" value={String(rows.filter((r) => r.st.failureProb7d > 0.6 && r.st.status !== "service").length)} accent="var(--critical)" />
        <Stat label="Degraded (>30%)" value={String(rows.filter((r) => r.st.failureProb7d > 0.3 && r.st.failureProb7d <= 0.6).length)} accent="var(--warm)" />
        <Stat label="In service" value={String(rows.filter((r) => r.st.status === "service").length)} accent="var(--accent)" />
        <Stat label="Failed" value={String(rows.filter((r) => r.st.status === "failed").length)} accent="var(--critical)" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card
          title={`Cumulative failure probability · ${worst.a.name}`}
          right={
            <div className="flex items-center gap-2">
              {worst.st.failureProb7d > 0.25 && (
                <Link href="/command" onClick={() => { const room = sampleServedRoom(model, state, worst.a.id); if (room) useTrace.getState().start(room, worst.a.id); }}>
                  <Button size="sm" variant="outline" className="border-critical/50 text-critical hover:bg-critical/10">
                    <Radar size={12} /> Investigate on twin
                  </Button>
                </Link>
              )}
              <Provenance kind="modeled" />
            </div>
          }
          className="col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={survival}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" />
              <XAxis dataKey="d" stroke={chartTheme.axis} fontSize={10} tickFormatter={(v) => `${v}d`} />
              <YAxis stroke={chartTheme.axis} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <ReferenceLine x={7} stroke="#9aa7b8" strokeDasharray="3 3" label={{ value: "7d horizon", fill: "#9aa7b8", fontSize: 10 }} />
              <ReferenceLine y={50} stroke="#5b6879" strokeDasharray="3 3" label={{ value: "RUL (P=0.5)", fill: "#5b6879", fontSize: 10, position: "right" }} />
              <Line type="monotone" dataKey="base" stroke="#5b6879" dot={false} name="age-only hazard" strokeDasharray="4 3" />
              <Line type="monotone" dataKey="p" stroke="#f4436c" strokeWidth={2} dot={false} name="with telemetry anomaly" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Open work orders">
          {openWO.length === 0 ? (
            <p className="text-[12px] text-low">No active work orders.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {openWO.map((w) => (
                <div key={w.id} className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-hi">{model.assetById.get(w.roomId)?.name ?? w.roomId}</span>
                    <Tag color="#2dd4bf">{w.status}</Tag>
                  </div>
                  <div className="mt-1 text-[10.5px] text-low">{w.text} · {w.assignedTo ? state.staff[w.assignedTo]?.name : "queued"}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Asset register">
        <table className="w-full text-[12px]">
          <thead className="label text-left">
            <tr>
              <th className="pb-2 font-normal">Asset</th>
              <th className="pb-2 font-normal">Location</th>
              <th className="pb-2 font-normal">Status</th>
              <th className="pb-2 font-normal">P(fail 7d)</th>
              <th className="pb-2 font-normal">RUL</th>
              <th className="pb-2 font-normal">Health</th>
              <th className="pb-2 font-normal">Runtime</th>
              <th className="pb-2 font-normal">Temp z</th>
              <th className="pb-2 font-normal">Vib z</th>
              <th className="pb-2 font-normal">Serves</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody className="mono">
            {rows.map(({ a, st, res }) => {
              const color = st.status === "failed" || st.failureProb7d > 0.6 ? "var(--critical)" : st.failureProb7d > 0.3 ? "var(--warm)" : "var(--accent)";
              return (
                <tr key={a.id} className="border-t border-stroke/60">
                  <td className="py-2">
                    <Link href="/command" onClick={() => useTwin.getState().select({ kind: "asset", id: a.id })} className="text-hi hover:text-accent">
                      {a.name}
                    </Link>
                  </td>
                  <td className="py-2 text-mid">{a.floor >= model.floors.length ? "Roof" : a.floor === 0 ? "Ground" : `F${a.floor}`}</td>
                  <td className="py-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase", st.status === "healthy" ? "bg-accent/10 text-accent" : st.status === "service" ? "bg-accent/10 text-accent" : st.status === "degraded" ? "bg-warm/10 text-warm" : "bg-critical/10 text-critical")}>{st.status}</span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <Meter value={st.failureProb7d} color={color} className="w-20" />
                      <span style={{ color }}>{(st.failureProb7d * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-mid">{st.rulDays}d</td>
                  <td className="py-2 text-mid">{(st.health * 100).toFixed(0)}%</td>
                  <td className="py-2 text-mid">{Math.round(st.runtimeHours).toLocaleString()}h</td>
                  <td className={cn("py-2", res.tempZ > 2 ? "text-critical" : "text-mid")}>{res.tempZ.toFixed(1)}</td>
                  <td className={cn("py-2", res.vibZ > 2 ? "text-critical" : "text-mid")}>{res.vibZ.toFixed(1)}</td>
                  <td className="py-2 text-mid">{model.rooms.filter((r) => a.servesFloors.includes(r.floor)).length} rooms</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {st.failureProb7d > 0.25 && (
                        <Link href="/command" onClick={() => { const room = sampleServedRoom(model, state, a.id); if (room) useTrace.getState().start(room, a.id); }}>
                          <Button size="sm" variant="ghost" title="Investigate on the twin">
                            <Radar size={12} />
                          </Button>
                        </Link>
                      )}
                      {st.status !== "service" && st.status !== "failed" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => mutate((s) => scheduleService(s, model, a.id))}>
                            Service
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => mutate((s) => triggerFailure(s, model, a.id))} title="Demo: inject fault">
                            Fault
                          </Button>
                        </>
                      )}
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
