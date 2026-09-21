"use client";

import { Waves, Star, Thermometer, Sparkles, Radar, Camera } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { useTrace } from "@/store/trace";
import { getModel } from "@/lib/architecture/model";
import { statusColors, statusLabels } from "@/lib/twin/colors";
import { nextBestActions } from "@/lib/intelligence/personalization";
import { worstAssetForRoom } from "@/lib/twin/trace";
import { setRoomConditioning } from "@/lib/sim/actions";
import { createRequest, dispatchStaff, pushFeed, fmtClock } from "@/lib/sim/engine";
import { Button, Meter, Provenance, Section, Stat, Tag } from "@/components/ui/primitives";
import { fmtINR, cn } from "@/lib/utils";
import { DAY } from "@/lib/sim/seed";

export function RoomPanel({ id }: { id: string }) {
  const { state, mutate } = useSim();
  const model = getModel();
  const cell = model.roomById.get(id);
  const rs = state.rooms[id];
  if (!cell || !rs) return null;
  const g = rs.guestId ? state.guests[rs.guestId] : null;
  const reqs = Object.values(state.requests).filter((r) => r.roomId === id && r.status !== "done");
  const nba = g ? nextBestActions(g, state, model) : [];
  const assets = model.assets.filter((a) => a.servesFloors.includes(cell.floor) && a.kind !== "elevator");
  const worst = assets.map((a) => ({ a, st: state.assets[a.id] })).sort((x, y) => y.st.failureProb7d - x.st.failureProb7d)[0];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[22px] font-semibold leading-none">Room {cell.number}</h2>
            {cell.seaView && (
              <Tag color="#60a5fa">
                <Waves size={10} className="mr-1" />
                sea view
              </Tag>
            )}
          </div>
          <p className="mt-1 text-[12px] text-mid">
            Floor {cell.floor} · {cell.type} · {cell.side} wing · {cell.w.toFixed(0)}×{cell.d.toFixed(0)} m
          </p>
        </div>
        <span className="mono rounded-md px-2 py-1 text-[11px]" style={{ background: statusColors[rs.status] + "22", color: statusColors[rs.status] }}>
          {statusLabels[rs.status]}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Rate" value={fmtINR(rs.rate)} sub="per night" />
        <Stat label="7d revenue" value={fmtINR(rs.revenue7d)} sub={`${rs.nights7d} nights`} />
        <Stat label="Maint. risk" value={`${(rs.maintRisk * 100).toFixed(0)}%`} accent={rs.maintRisk > 0.5 ? "var(--critical)" : rs.maintRisk > 0.3 ? "var(--warm)" : undefined} sub={worst ? worst.a.name : "—"} />
      </div>

      {(rs.maintRisk > 0.25 || (g && g.sentiment < -0.15)) && (
        <Button
          size="sm"
          variant="outline"
          className="self-start border-critical/50 text-critical hover:bg-critical/10"
          onClick={() => {
            const w = worstAssetForRoom(model, state, id);
            if (w) useTrace.getState().start(id, w.id);
          }}
        >
          <Radar size={12} /> Investigate root cause
        </Button>
      )}

      {g ? (
        <Section title="In-house guest" right={<Provenance />}>
          <div className="rounded-lg border border-stroke bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-[14px] font-medium text-hi">
                  {g.name}
                  {g.vip && (
                    <Tag color="#f5d26b">
                      <Star size={10} className="mr-1" />
                      VIP
                    </Tag>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-mid">
                  {g.segment.replace("-", " ")} · {g.loyalty} · {g.nationality} · {g.adults}A{g.children ? ` ${g.children}C` : ""} · via {g.channel}
                </div>
              </div>
              <div className="text-right">
                <div className="label">sentiment</div>
                <div className={cn("mono text-[18px]", g.sentiment < -0.2 ? "text-critical" : g.sentiment > 0.3 ? "text-positive" : "text-warm")}>{g.sentiment >= 0 ? "+" : ""}{g.sentiment.toFixed(2)}</div>
              </div>
            </div>
            <Meter value={(g.sentiment + 1) / 2} color={g.sentiment < -0.2 ? "var(--critical)" : g.sentiment > 0.3 ? "var(--positive)" : "var(--warm)"} className="mt-2" />
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <Camera size={12} className={rs.presence < 0.15 ? "text-low" : "text-accent"} />
              <span className="flex-1 text-mid">
                Presence (CCTV) {rs.ecoMode && <span className="text-accent">· eco setback active</span>}
              </span>
              <Meter value={rs.presence} color={rs.presence < 0.15 ? "var(--warm)" : "var(--accent)"} className="w-20" />
              <span className="mono w-9 text-right text-low">{(rs.presence * 100).toFixed(0)}%</span>
            </div>
            <div className="mono mt-3 grid grid-cols-4 gap-2 text-[10.5px] text-low">
              <div>
                <div className="label">in</div>
                {fmtClock(g.checkIn)}
              </div>
              <div>
                <div className="label">out</div>
                {fmtClock(g.checkOut)}
              </div>
              <div>
                <div className="label">nights</div>
                {Math.max(1, Math.round((g.checkOut - g.checkIn) / DAY))}
              </div>
              <div>
                <div className="label">stays</div>
                {g.stays}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {g.prefs.map((p) => (
                <span key={p} className="rounded bg-white/5 px-1.5 py-0.5 text-[10.5px] text-mid">
                  {p}
                </span>
              ))}
            </div>
            <div className="mono mt-3 flex justify-between text-[11px]">
              <span className="text-low">Spend</span>
              <span className="text-hi">
                {fmtINR(g.spendRoom + g.spendFnb + g.spendSpa + g.spendOther)} <span className="text-low">(F&B {fmtINR(g.spendFnb)}, spa {fmtINR(g.spendSpa)})</span>
              </span>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Room state">
          <div className="rounded-lg border border-stroke bg-white/[0.02] p-3 text-[12px] text-mid">
            {rs.status === "vacant-dirty" ? `Awaiting housekeeping · ${Math.round(rs.hkMinutes)} min of work queued.` : rs.status === "cleaning" ? "Room attendant on site." : rs.status === "ooo" ? "Out of order — engineering hold." : "Ready to sell."}
            <div className="mt-2 flex items-center gap-2">
              <Thermometer size={13} className={rs.conditioned ? "text-warm" : "text-low"} />
              <span className="flex-1">
                Conditioning {rs.conditioned ? "ON" : "off"} · {rs.energyKwh.toFixed(1)} kWh/24h
              </span>
              {rs.conditioned && (
                <Button size="sm" variant="outline" onClick={() => mutate((s) => { setRoomConditioning(s, id, false); pushFeed(s, "task", `Setback applied to vacant ${cell.number} · est. −33 kWh/day`, "room", id); })}>
                  Setback
                </Button>
              )}
            </div>
          </div>
        </Section>
      )}

      {nba.length > 0 && (
        <Section title="Next best action" right={<Tag color="#34d399">NBA</Tag>}>
          <div className="flex flex-col gap-1.5">
            {nba.slice(0, 3).map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-stroke bg-white/[0.02] px-3 py-2">
                <div className="mono w-9 text-[13px] text-positive">{a.score.toFixed(2)}</div>
                <div className="flex-1">
                  <div className="text-[12px] text-hi">{a.label}</div>
                  <div className="text-[10.5px] text-low">{a.reason}</div>
                </div>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    mutate((s) => {
                      const gg = s.guests[g!.id];
                      gg.sentiment = Math.min(1, gg.sentiment + a.uplift);
                      s.rooms[id].sentiment = gg.sentiment;
                      pushFeed(s, "task", `${a.label} → ${gg.name} (${cell.number})`, "guest", gg.id);
                    })
                  }
                >
                  <Sparkles size={12} /> Do it
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Open requests (${reqs.length})`}>
        {reqs.length === 0 ? (
          <p className="text-[12px] text-low">No open requests.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {reqs.map((r) => {
              const age = state.t - r.createdAt;
              const late = age > r.slaMin && r.status !== "in-progress";
              return (
                <div key={r.id} className="rounded-lg border border-stroke bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <Tag color={late ? "#f4436c" : undefined}>{r.type}</Tag>
                    <span className={cn("mono text-[10.5px]", late ? "text-critical" : "text-low")}>
                      {r.status} · {Math.round(age)}m / SLA {r.slaMin}m
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-mid">{r.text}</p>
                  {r.assignedTo && <p className="mt-0.5 text-[10.5px] text-low">→ {state.staff[r.assignedTo]?.name}</p>}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-1.5">
          {(rs.status === "vacant-dirty") && (
            <Button size="sm" variant="outline" onClick={() => mutate((s) => { const rq = createRequest(s, model, id, "housekeeping", "Priority clean", "system", 30); dispatchStaff(s, model, rq, "housekeeping"); pushFeed(s, "task", `Priority clean requested for ${cell.number}`, "room", id); })}>
              Prioritise clean
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => mutate((s) => { const rq = createRequest(s, model, id, "maintenance", "Manager-requested inspection", "staff", 45, rs.guestId); dispatchStaff(s, model, rq, "engineering"); pushFeed(s, "task", `Inspection dispatched to ${cell.number}`, "room", id); })}>
            Send engineer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useTwin.getState().setViewMode("room")}>
            Enter room
          </Button>
        </div>
      </Section>
    </div>
  );
}
