"use client";

import { Wrench, Zap, Activity, Radar, Users } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTrace } from "@/store/trace";
import { getModel } from "@/lib/architecture/model";
import { assessAsset } from "@/lib/intelligence/maintenance";
import { assessGuestImpact } from "@/lib/intelligence/guestImpact";
import { sampleServedRoom } from "@/lib/twin/trace";
import { scheduleService, pushFeed, fmtClock } from "@/lib/sim/engine";
import { triggerFailure, relocateGuest } from "@/lib/sim/actions";
import { Button, Meter, Provenance, Section, Sparkline, Stat, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const kindLabel: Record<string, string> = { chiller: "Chiller plant", ahu: "Air handling unit", elevator: "Elevator", pump: "Circulation pump", boiler: "Hot water boiler", generator: "Standby generator", "kitchen-hood": "Kitchen extract", "pool-filter": "Pool filtration" };

export function AssetPanel({ id }: { id: string }) {
  const { state, mutate } = useSim();
  const model = getModel();
  const a = model.assetById.get(id);
  const st = state.assets[id];
  if (!a || !st) return null;
  const res = assessAsset(a.kind, st);
  const risk = st.failureProb7d;
  const color = st.status === "failed" ? "var(--critical)" : risk > 0.6 ? "var(--critical)" : risk > 0.3 ? "var(--warm)" : "var(--accent)";
  const rooms = model.rooms.filter((r) => a.servesFloors.includes(r.floor));
  const occ = rooms.filter((r) => state.rooms[r.id].guestId).length;
  const wo = Object.values(state.requests).find((r) => r.roomId === id && r.status !== "done");
  const temps = st.history.map((h) => h.temp);
  const vibs = st.history.map((h) => h.vib);
  const impact = st.status === "failed" ? assessGuestImpact(state, model, id) : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-[22px] font-semibold leading-none">{a.name}</h2>
          <p className="mt-1 text-[12px] text-mid">
            {kindLabel[a.kind]} · {a.floor >= model.floors.length ? "Roof plant" : a.floor === 0 ? "Ground / BOH" : `Floor ${a.floor} core`} · serves {rooms.length} rooms ({occ} occupied)
          </p>
        </div>
        <Tag color={color.startsWith("var") ? undefined : color} className={cn(st.status === "failed" && "border-critical text-critical", st.status === "critical" && "border-critical/60 text-critical", st.status === "degraded" && "border-warm/60 text-warm", st.status === "service" && "border-accent/60 text-accent")}>
          {st.status}
        </Tag>
      </header>

      <div className="rounded-lg border border-stroke bg-white/[0.02] p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="label">P(failure ≤ 7 days)</div>
            <div className="mono text-[34px] leading-none" style={{ color }}>
              {(risk * 100).toFixed(0)}%
            </div>
          </div>
          <div className="text-right">
            <div className="label">RUL estimate</div>
            <div className="mono text-[20px] leading-none text-hi">{st.rulDays} d</div>
          </div>
        </div>
        <Meter value={risk} color={color} className="mt-3" />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10.5px] text-low">Weibull hazard (k, λ by asset class) × telemetry anomaly</span>
          <Provenance kind="modeled" module="maintenance" />
        </div>
        {risk > 0.25 && occ > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 border-critical/50 text-critical hover:bg-critical/10"
            onClick={() => {
              const room = sampleServedRoom(model, state, id);
              if (room) useTrace.getState().start(room, id);
            }}
          >
            <Radar size={12} /> Trace to affected guest
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Health index" value={`${(st.health * 100).toFixed(0)}%`} />
        <Stat label="Runtime" value={`${Math.round(st.runtimeHours).toLocaleString()} h`} />
        <Stat label="Last service" value={`${Math.round((state.t - st.lastServiceAt) / 1440)} d`} sub={fmtClock(st.lastServiceAt)} />
      </div>

      <Section title="Telemetry" right={<Provenance />}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-stroke bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between">
              <span className="label">discharge temp</span>
              <span className={cn("mono text-[10.5px]", res.tempZ > 2 ? "text-critical" : "text-low")}>z {res.tempZ.toFixed(1)}</span>
            </div>
            <div className="mono mt-1 text-[16px] text-hi">
              {st.temp.toFixed(1)}°C <span className="text-[10px] text-low">/ {st.tempBase.toFixed(0)} base</span>
            </div>
            <Sparkline data={temps.length > 1 ? temps : [st.tempBase, st.temp]} width={170} height={30} color={res.tempZ > 2 ? "var(--critical)" : "var(--warm)"} className="mt-1 w-full" />
          </div>
          <div className="rounded-lg border border-stroke bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between">
              <span className="label">vibration</span>
              <span className={cn("mono text-[10.5px]", res.vibZ > 2 ? "text-critical" : "text-low")}>z {res.vibZ.toFixed(1)}</span>
            </div>
            <div className="mono mt-1 text-[16px] text-hi">
              {st.vibration.toFixed(2)} <span className="text-[10px] text-low">mm/s · {st.vibBase.toFixed(1)} base</span>
            </div>
            <Sparkline data={vibs.length > 1 ? vibs : [st.vibBase, st.vibration]} width={170} height={30} color={res.vibZ > 2 ? "var(--critical)" : "var(--accent)"} className="mt-1 w-full" />
          </div>
        </div>
        <div className="mono flex items-center gap-4 text-[10.5px] text-low">
          <span className="flex items-center gap-1">
            <Zap size={11} /> load {st.current.toFixed(0)}%
          </span>
          <span className="flex items-center gap-1">
            <Activity size={11} /> anomaly {res.anomaly.toFixed(2)}
          </span>
          <span>base hazard {(res.hazardBase * 100).toFixed(1)}%</span>
        </div>
      </Section>

      <Section title="Work order">
        {wo ? (
          <div className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-hi">{wo.text}</span>
              <Tag color="#2dd4bf">{wo.status}</Tag>
            </div>
            <div className="mt-1 text-[10.5px] text-low">
              {wo.assignedTo ? `${state.staff[wo.assignedTo]?.name} · ${state.staff[wo.assignedTo]?.status}` : "Queued for engineering"} · opened {fmtClock(wo.createdAt)}
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button variant="primary" size="sm" onClick={() => mutate((s) => scheduleService(s, model, id))}>
              <Wrench size={12} /> Schedule service
            </Button>
            <Button variant="danger" size="sm" onClick={() => mutate((s) => triggerFailure(s, model, id))} title="Demo: inject fault">
              Inject fault
            </Button>
          </div>
        )}
      </Section>

      {impact && impact.pairs.length > 0 ? (
        <Section title="Guest impact & relocation" right={<Tag color="#f5a524">RELOC</Tag>}>
          <p className="text-[12px] leading-relaxed text-mid">
            {impact.assetName} is down. {impact.affectedGuestCount} guests are in unconditioned rooms; {impact.pairs.length} have a same-or-better vacant room outside its zone
            {impact.unplaced ? `, ${impact.unplaced} have no match yet` : ""}.
          </p>
          <div className="flex flex-col gap-1.5">
            {impact.pairs.map((p) => (
              <div key={p.guestId} className="flex items-center justify-between rounded-lg border border-stroke bg-white/[0.02] px-3 py-2 text-[12px]">
                <span className="text-hi">
                  {p.guestName} · {p.fromRoomNumber} → {p.toRoomNumber}
                  {p.upgrade && (
                    <Tag color="#34d399" className="ml-1.5">
                      upgrade
                    </Tag>
                  )}
                </span>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="primary"
            className="self-start"
            onClick={() =>
              mutate((s) => {
                for (const pair of impact.pairs) relocateGuest(s, model, pair);
              })
            }
          >
            <Users size={12} /> Relocate all {impact.pairs.length}
          </Button>
        </Section>
      ) : (
        <Section title="Impact if failed">
          <p className="text-[12px] leading-relaxed text-mid">
            {a.kind === "chiller" || a.kind === "ahu"
              ? `Loss of conditioning for ${rooms.length} rooms. Modeled sentiment decay −0.07/h for ${occ} in-house guests, est. ${Math.round(occ * 0.35)} room-nights compensated.`
              : a.kind === "elevator"
                ? `Vertical transport reduced to ${model.assets.filter((x) => x.kind === "elevator").length - 1} cars. Sentiment decay −0.03/h across ${occ} guests.`
                : `Service interruption in ${a.floor === 0 ? "ground floor operations" : "roof amenities"}.`}
          </p>
          <Button size="sm" variant="ghost" className="self-start" onClick={() => mutate((s) => pushFeed(s, "system", `Impact note logged for ${a.name}`, "asset", id))}>
            Log note
          </Button>
        </Section>
      )}
    </div>
  );
}
