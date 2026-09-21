"use client";

import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { aspectSummary } from "@/lib/intelligence/sentiment";
import { deptColors } from "@/lib/twin/colors";
import { depts } from "@/lib/intelligence/staffing";
import { Meter, Provenance, Section, Sparkline, Stat } from "@/components/ui/primitives";
import { cn, fmtINR } from "@/lib/utils";

export function OverviewPanel() {
  const { state } = useSim();
  const model = getModel();
  const k = state.kpis;
  const hist = state.kpiHistory.slice(-48);
  const floors = model.floors.filter((f) => f.kind === "guest");
  const risky = model.assets
    .map((a) => ({ a, st: state.assets[a.id] }))
    .filter((x) => x.st.failureProb7d > 0.25 || x.st.status === "failed")
    .sort((x, y) => y.st.failureProb7d - x.st.failureProb7d)
    .slice(0, 4);
  const aspects = aspectSummary(state.reviews, state.t).filter((a) => a.mentions > 0).sort((a, b) => a.score - b.score).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="font-display text-[22px] font-semibold leading-none">{model.name}</h2>
        <p className="mt-1 text-[12px] text-mid">
          {model.rooms.length} rooms · {floors.length} guest floors · {model.assets.length} monitored assets · {Object.values(state.staff).length} staff
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Occupancy", value: `${(k.occupancy * 100).toFixed(1)}%`, data: hist.map((h) => h.occupancy) },
          { label: "RevPAR", value: fmtINR(k.revpar), data: hist.map((h) => h.revpar) },
          { label: "ADR", value: fmtINR(k.adr), data: hist.map((h) => h.adr) },
          { label: "Guest sat", value: k.gss.toFixed(2), data: hist.map((h) => h.gss) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-stroke bg-white/[0.02] p-2.5">
            <div className="label">{c.label}</div>
            <div className="mono mt-0.5 text-[18px] text-hi">{c.value}</div>
            <Sparkline data={c.data.length > 1 ? c.data : [0, 0]} width={150} height={26} className="mt-1 w-full" />
          </div>
        ))}
      </div>

      <Section title="Occupancy by floor" right={<Provenance />}>
        <div className="flex flex-col gap-1">
          {floors
            .slice()
            .reverse()
            .map((f) => {
              const rs = f.rooms.map((r) => state.rooms[r.id]);
              const occ = rs.filter((r) => r.guestId).length / rs.length;
              const dirty = rs.filter((r) => r.status === "vacant-dirty").length;
              const risk = Math.max(...rs.map((r) => r.maintRisk));
              return (
                <button key={f.index} onClick={() => useTwin.getState().setIsolatedFloor(f.index)} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5">
                  <span className="mono w-4 text-[11px] text-low">{f.index}</span>
                  <Meter value={occ} color="var(--accent)" className="flex-1" />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: risk > 0.6 ? "var(--critical)" : risk > 0.3 ? "var(--warm)" : "var(--stroke-lit)" }} title={`max asset risk ${(risk * 100).toFixed(0)}%`} />
                  <span className="mono w-10 text-right text-[10.5px] text-mid">{(occ * 100).toFixed(0)}%</span>
                  <span className={cn("mono w-8 text-right text-[10px]", dirty ? "text-warm" : "text-low")}>{dirty}d</span>
                </button>
              );
            })}
        </div>
      </Section>

      <Section title="Asset risk">
        {risky.length === 0 ? (
          <p className="text-[12px] text-low">All assets below 25% 7-day failure probability.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {risky.map(({ a, st }) => (
              <button key={a.id} onClick={() => useTwin.getState().select({ kind: "asset", id: a.id })} className="flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5">
                <span className="h-2 w-2 rounded-full" style={{ background: st.status === "failed" || st.failureProb7d > 0.6 ? "var(--critical)" : "var(--warm)", boxShadow: "0 0 6px currentColor" }} />
                <span className="flex-1 text-[12px] text-hi">{a.name}</span>
                <span className="mono text-[11px] text-mid">{st.status === "failed" ? "FAILED" : `${(st.failureProb7d * 100).toFixed(0)}% · ${st.rulDays}d`}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Staff on duty">
        <div className="grid grid-cols-4 gap-1.5">
          {depts.map((d) => {
            const on = Object.values(state.staff).filter((s) => s.dept === d && s.status !== "off");
            const busy = on.filter((s) => s.status !== "idle").length;
            return (
              <div key={d} className="rounded-md border border-stroke bg-white/[0.02] px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: deptColors[d] }} />
                  <span className="truncate text-[10px] text-low">{d}</span>
                </div>
                <div className="mono text-[13px] text-hi">
                  {busy}
                  <span className="text-low">/{on.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {aspects.length > 0 && (
        <Section title="Sentiment by aspect · 7d">
          <div className="flex flex-col gap-1">
            {aspects.map((a) => (
              <div key={a.aspect} className="flex items-center gap-2">
                <span className="w-20 text-[11px] capitalize text-mid">{a.aspect}</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-white/5">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-stroke-lit" />
                  <div className="absolute top-0 h-full rounded-full" style={{ left: a.score < 0 ? `${50 + a.score * 50}%` : "50%", width: `${Math.abs(a.score) * 50}%`, background: a.score < 0 ? "var(--critical)" : "var(--positive)" }} />
                </div>
                <span className="mono w-14 text-right text-[10.5px] text-low">
                  {a.score >= 0 ? "+" : ""}
                  {a.score.toFixed(2)} · {a.mentions}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Revenue today" value={fmtINR(k.revenueToday)} />
        <Stat label="Energy today" value={`${k.energyToday.toFixed(0)} kWh`} sub={`${Object.values(state.rooms).filter((r) => r.conditioned && !r.guestId).length} vacant rooms conditioned`} />
        <Stat label="Energy saved" value={`${k.energySavedToday.toFixed(0)} kWh`} accent="var(--accent)" sub={fmtINR(k.energySavedToday * 9)} />
      </div>
    </div>
  );
}
