"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { assessHousekeepingFatigue, BURNOUT_THRESHOLD, depts, forecastDemand, solveRoster, STANDARD_ROOMS_PER_HK_SHIFT } from "@/lib/intelligence/staffing";
import { deptColors } from "@/lib/twin/colors";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { fmtClock } from "@/lib/sim/engine";
import { AnalyticsShell, Card, chartTheme } from "./AnalyticsShell";
import { Button, Meter, Provenance, Stat, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function OperationsPage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const demand = forecastDemand(state, model);
  const roster = solveRoster(state, model);
  const hour = Math.floor((state.t % 1440) / 60);
  const staff = Object.values(state.staff);
  const reqs = Object.values(state.requests).filter((r) => r.status !== "done").sort((a, b) => a.createdAt - b.createdAt);
  const recs = Object.values(state.recommendations).filter((r) => r.module === "staffing" && r.status === "pending");
  const done = Object.values(state.requests).filter((r) => r.status === "done");
  const onTime = done.filter((r) => (r.completedAt ?? 0) - r.createdAt <= r.slaMin).length;
  const hkFatigue = assessHousekeepingFatigue(state);

  return (
    <AnalyticsShell title="Operations & Staffing" subtitle="Hourly demand forecast per department, solved into a shift roster with greedy allocation and pairwise swap improvement. Gaps become call-in recommendations.">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="On shift" value={String(staff.filter((s) => s.status !== "off").length)} sub={`${staff.length} total`} />
        <Stat label="Busy" value={String(staff.filter((s) => s.status === "working" || s.status === "moving").length)} />
        <Stat label="Open requests" value={String(reqs.length)} accent={reqs.length > 8 ? "var(--warm)" : undefined} />
        <Stat label="SLA on-time" value={done.length ? `${((onTime / done.length) * 100).toFixed(0)}%` : "—"} sub={`${done.length} closed`} />
        <Stat label="Unmet roster slots" value={String(roster.unmet)} accent={roster.unmet ? "var(--warm)" : undefined} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="Demand forecast · next 24h (staff required)" right={<Provenance kind="modeled" module="staffing" />} className="col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={demand.map((d) => ({ h: `${String(d.hour).padStart(2, "0")}:00`, ...d.demand }))}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="2 4" />
              <XAxis dataKey="h" stroke={chartTheme.axis} fontSize={10} />
              <YAxis stroke={chartTheme.axis} fontSize={10} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              {depts.map((d) => (
                <Area key={d} type="monotone" dataKey={d} stackId="1" stroke={deptColors[d]} fill={deptColors[d]} fillOpacity={0.35} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-1 flex flex-wrap gap-3">
            {depts.map((d) => (
              <span key={d} className="flex items-center gap-1 text-[10.5px] text-mid">
                <span className="h-2 w-2 rounded-sm" style={{ background: deptColors[d] }} /> {d}
              </span>
            ))}
          </div>
        </Card>
        <Card title="Call-in recommendations">
          {recs.length === 0 ? (
            <p className="text-[12px] text-low">Roster covers forecast demand for the next shift.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recs.map((r) => (
                <div key={r.id} className="rounded-lg border border-warm/40 bg-warm/5 p-3">
                  <div className="text-[12.5px] text-hi">{r.title}</div>
                  <p className="mt-1 text-[11px] text-mid">{r.impact}</p>
                  <Button size="sm" variant="primary" className="mt-2" onClick={() => acceptRecommendation(mutate, model, r)}>
                    Call in {r.payload?.count as number}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Shift roster · required vs rostered" right={<span className="mono text-[10.5px] text-low">now {String(hour).padStart(2, "0")}:00</span>}>
        <table className="w-full text-[12px]">
          <thead className="label text-left">
            <tr>
              <th className="pb-2 font-normal">Department</th>
              {["morning", "evening", "night"].map((s) => (
                <th key={s} className="pb-2 font-normal capitalize">
                  {s} <span className="text-low">{s === "morning" ? "06–14" : s === "evening" ? "14–22" : "22–06"}</span>
                </th>
              ))}
              <th className="pb-2 font-normal">On duty now</th>
            </tr>
          </thead>
          <tbody className="mono">
            {depts.map((d) => (
              <tr key={d} className="border-t border-stroke/60">
                <td className="py-2 capitalize" style={{ color: deptColors[d] }}>
                  {d}
                </td>
                {(["morning", "evening", "night"] as const).map((s) => {
                  const p = roster.plan.find((x) => x.dept === d && x.shift === s)!;
                  return (
                    <td key={s} className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 items-end gap-px">
                          {Array.from({ length: Math.max(p.required, p.rostered) }).map((_, i) => (
                            <span key={i} className={cn("w-1.5 rounded-sm", i < p.rostered ? "h-4 bg-accent/70" : "h-4 bg-critical/60")} />
                          ))}
                        </div>
                        <span className={cn(p.gap > 0 ? "text-critical" : "text-mid")}>
                          {p.rostered}/{p.required}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="py-2 text-hi">
                  {staff.filter((x) => x.dept === d && x.status !== "off").length}
                  <span className="text-low"> · {staff.filter((x) => x.dept === d && (x.status === "working" || x.status === "moving")).length} busy</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Housekeeping fatigue"
        right={<Provenance kind="modeled" module="staffing" />}
      >
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Avg fatigue" value={`${(hkFatigue.avgFatigue * 100).toFixed(0)}%`} accent={hkFatigue.avgFatigue >= BURNOUT_THRESHOLD ? "var(--critical)" : hkFatigue.avgFatigue >= BURNOUT_THRESHOLD * 0.7 ? "var(--warm)" : undefined} />
          <Stat label="At burnout risk" value={String(hkFatigue.atRisk.length)} sub={`of ${hkFatigue.staffCount} · ≥${(BURNOUT_THRESHOLD * 100).toFixed(0)}%`} accent={hkFatigue.atRisk.length > 0 ? "var(--warm)" : undefined} />
          <Stat label="Rooms / attendant" value={hkFatigue.loadPerAttendant.toFixed(1)} sub={`standard ${STANDARD_ROOMS_PER_HK_SHIFT}`} accent={hkFatigue.loadPerAttendant > STANDARD_ROOMS_PER_HK_SHIFT ? "var(--warm)" : undefined} />
          <Stat label="Over standard" value={hkFatigue.loadPerAttendant > STANDARD_ROOMS_PER_HK_SHIFT ? `+${(hkFatigue.loadPerAttendant - STANDARD_ROOMS_PER_HK_SHIFT).toFixed(1)}` : "0"} />
        </div>
        {hkFatigue.atRisk.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-stroke/60 pt-3">
            {hkFatigue.atRisk.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="w-28 truncate text-[11.5px] text-mid">{s.name}</span>
                <Meter value={s.fatigue} color="var(--warm)" className="flex-1" />
                <span className="mono w-10 text-right text-[10.5px] text-low">{(s.fatigue * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-low">
          Fatigue accrues while working shifts above the {STANDARD_ROOMS_PER_HK_SHIFT}-room-per-attendant standard, and recovers off-duty. Sustained overload correlates with up to 55% 90-day turnover in hotel housekeeping research — the burnout recommendation above prices that exposure.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title={`Open requests (${reqs.length})`}>
          <div className="scrollbar-thin flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
            {reqs.length === 0 && <p className="text-[12px] text-low">Queue is clear.</p>}
            {reqs.map((r) => {
              const age = state.t - r.createdAt;
              const late = age > r.slaMin && r.status !== "in-progress";
              const target = r.roomId.startsWith("room-") ? model.roomById.get(r.roomId)?.number : model.assetById.get(r.roomId)?.name ?? r.roomId;
              return (
                <div key={r.id} className={cn("flex items-center gap-3 rounded-lg border bg-white/[0.02] px-3 py-2", late ? "border-critical/50" : "border-stroke")}>
                  <Tag color={late ? "#f4436c" : undefined}>{r.type}</Tag>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-hi">
                      <Link href="/command" onClick={() => useTwin.getState().select(r.roomId.startsWith("room-") ? { kind: "room", id: r.roomId } : { kind: "asset", id: r.roomId })} className="hover:text-accent">
                        {target}
                      </Link>{" "}
                      · {r.text}
                    </div>
                    <div className="mono text-[10px] text-low">
                      {r.status} · {Math.round(age)}m / SLA {r.slaMin}m · {r.assignedTo ? state.staff[r.assignedTo]?.name : "unassigned"} · {fmtClock(r.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Staff board">
          <div className="scrollbar-thin grid max-h-[360px] grid-cols-2 gap-1 overflow-y-auto">
            {staff
              .filter((s) => s.status !== "off")
              .sort((a, b) => a.dept.localeCompare(b.dept))
              .map((s) => (
                <Link key={s.id} href="/command" onClick={() => useTwin.getState().select({ kind: "staff", id: s.id })} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                  <span className="h-2 w-2 rounded-full" style={{ background: deptColors[s.dept] }} />
                  <span className="flex-1 truncate text-[12px] text-hi">{s.name}</span>
                  <span className="mono text-[10px] text-low">
                    {s.role} · F{s.floor} · {s.status}
                  </span>
                </Link>
              ))}
          </div>
        </Card>
      </div>
    </AnalyticsShell>
  );
}
