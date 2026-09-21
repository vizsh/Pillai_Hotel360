"use client";

import { useEffect } from "react";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { assessInventory } from "@/lib/intelligence/inventory";
import { deptColors } from "@/lib/twin/colors";
import { fmtClock } from "@/lib/sim/engine";
import { Button, Meter, Provenance, Section, Sparkline, Stat, Tag } from "@/components/ui/primitives";
import { cn, fmtINR } from "@/lib/utils";
import { acceptRecommendation } from "@/lib/api/recommendationActions";

export function ZonePanel({ id }: { id: string }) {
  const { state, mutate } = useSim();
  const model = getModel();
  const z = model.zoneById.get(id);
  if (!z) return null;
  const items = Object.values(state.inventory).filter((it) => it.storeZone === id);
  const staffHere = Object.values(state.staff).filter((s) => s.status !== "off" && Math.abs(s.position[0] - z.center[0]) < z.w / 2 && Math.abs(s.position[2] - z.center[2]) < z.d / 2 && s.floor === (z.floor >= model.floors.length ? 0 : z.floor));
  const occFactor = state.kpis.occupancy / 0.85;
  const isStore = items.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="font-display text-[22px] font-semibold leading-none">{z.name}</h2>
        <p className="mt-1 text-[12px] text-mid">
          {z.kind.replace("-", " ")} · {z.floor === 0 ? "Ground floor" : "Roof"} · {Math.round(z.w * z.d)} m²
        </p>
      </header>
      {isStore ? (
        <Section title="Inventory" right={<Provenance kind="modeled" module="inventory" />}>
          <div className="flex flex-col gap-1.5">
            {items.map((it) => {
              const a = assessInventory(it, occFactor);
              const rec = state.recommendations[`rec-inv-${it.id}`];
              const low = it.stock < a.reorderPoint;
              return (
                <div key={it.id} className={cn("rounded-lg border bg-white/[0.02] px-3 py-2", low ? "border-warm/50" : "border-stroke")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-hi">{it.name}</span>
                    <span className={cn("mono text-[11px]", low ? "text-warm" : "text-low")}>
                      {Math.round(it.stock)} {it.unit} · {a.daysCover.toFixed(1)}d cover
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Meter value={Math.min(1, it.stock / (a.reorderPoint * 2.5))} color={low ? "var(--warm)" : "var(--accent)"} className="flex-1" />
                    <Sparkline data={it.useHistory} width={60} height={16} fill={false} color="var(--text-low)" />
                  </div>
                  <div className="mono mt-1 flex items-center justify-between text-[10px] text-low">
                    <span>
                      ROP {a.reorderPoint} · EOQ {a.eoq} · lead {it.leadDays}d{it.onOrder ? ` · ${it.onOrder} on order` : ""}
                    </span>
                    {rec?.status === "pending" && (
                      <Button size="sm" variant="primary" className="h-6 px-2 text-[10.5px]" onClick={() => acceptRecommendation(mutate, model, rec)}>
                        Order {rec.payload?.qty as number}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Staff present" value={String(staffHere.length)} />
          <Stat label="Open requests" value={String(Object.values(state.requests).filter((r) => r.roomId === id && r.status !== "done").length)} />
        </div>
      )}
      <Section title={`Staff in zone (${staffHere.length})`}>
        {staffHere.length === 0 ? (
          <p className="text-[12px] text-low">Nobody in this zone right now.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {staffHere.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button onClick={() => useTwin.getState().select({ kind: "staff", id: s.id })} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-white/5">
                  <span className="h-2 w-2 rounded-full" style={{ background: deptColors[s.dept] }} />
                  <span className="flex-1 text-hi">{s.name}</span>
                  <span className="mono text-[10.5px] text-low">
                    {s.role} · {s.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export function StaffPanel({ id }: { id: string }) {
  const { state } = useSim();
  const model = getModel();
  const s = state.staff[id];
  if (!s) return null;
  const task = s.taskId ? state.requests[s.taskId] : null;
  const target = task ? (task.roomId.startsWith("room-") ? `Room ${model.roomById.get(task.roomId)?.number}` : model.assetById.get(task.roomId)?.name ?? model.zoneById.get(task.roomId)?.name ?? task.roomId) : null;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-[22px] font-semibold leading-none">{s.name}</h2>
          <p className="mt-1 text-[12px] text-mid">
            {s.role} · <span style={{ color: deptColors[s.dept] }}>{s.dept}</span> · {s.shift} shift
          </p>
        </div>
        <Tag color={deptColors[s.dept]}>{s.status}</Tag>
      </header>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Tasks today" value={String(s.tasksDone)} />
        <Stat label="Hours" value={s.hoursToday.toFixed(1)} sub={s.hoursToday > 8 ? "overtime" : "on shift"} accent={s.hoursToday > 8 ? "var(--warm)" : undefined} />
        <Stat label="Floor" value={String(s.floor)} />
      </div>
      <Section title="Current task">
        {task ? (
          <div className="rounded-lg border border-stroke bg-white/[0.02] px-3 py-2 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-hi">{target}</span>
              <Tag>{task.type}</Tag>
            </div>
            <p className="mt-1 text-mid">{task.text}</p>
            <p className="mono mt-1 text-[10.5px] text-low">
              opened {fmtClock(task.createdAt)} · {s.status === "working" ? `done ${fmtClock(s.workUntil)}` : `${s.path.length - s.pathIdx} waypoints left`}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-low">Idle — available for dispatch.</p>
        )}
      </Section>
      <Section title="Skills">
        <div className="flex flex-wrap gap-1">
          {s.skills.map((k) => (
            <span key={k} className="rounded bg-white/5 px-1.5 py-0.5 text-[10.5px] text-mid">
              {k}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function GuestPanel({ id }: { id: string }) {
  const { state } = useSim();
  const g = state.guests[id];
  const roomId = g?.roomId ?? null;
  useEffect(() => {
    if (roomId) useTwin.getState().select({ kind: "room", id: roomId });
  }, [roomId]);
  if (!g || roomId) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-[22px] font-semibold leading-none">{g.name}</h2>
      <p className="text-[12px] text-mid">Checked out · {g.segment} · {g.loyalty}</p>
      <Stat label="Total spend" value={fmtINR(g.spendRoom + g.spendFnb + g.spendSpa + g.spendOther)} />
    </div>
  );
}
