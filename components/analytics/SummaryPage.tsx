"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { useSim } from "@/store/sim";
import { useSimLoop } from "@/hooks/useSimLoop";
import { getModel } from "@/lib/architecture/model";
import { moduleMeta } from "@/lib/intelligence/registry";
import { fetchActionLog, type ActionLogEntry } from "@/lib/api/backend";
import { fmtClock } from "@/lib/sim/engine";
import { fmtINR, fmtPct } from "@/lib/utils";
import type { ModuleId } from "@/lib/sim/types";

const COST_PER_KWH = 9;

/** Standalone document, not wrapped in AnalyticsShell on purpose: the app chrome (top nav,
 * speed controls) has no reason to appear in a printed/exported summary. The one small top
 * bar here is marked print:hidden so `window.print()` outputs just the light "document"
 * card below it. */
export function SummaryPage() {
  useSimLoop();
  const { state } = useSim();
  useSim((s) => s.version);
  const model = getModel();
  const [mounted, setMounted] = useState(false);
  const [log, setLog] = useState<ActionLogEntry[] | null>(null);

  // Same SSR-hydration mount gate as AnalyticsShell — the sim store seeds independently on
  // server and client, so the first client render must match the server's markup.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    fetchActionLog(200)
      .then((entries) => {
        if (!cancelled) setLog(entries);
      })
      .catch(() => {
        if (!cancelled) setLog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const k = state.kpis;
  const openAlerts = Object.values(state.alerts).filter((a) => !a.resolvedAt);
  const criticalAlerts = openAlerts.filter((a) => a.severity === "critical").sort((a, b) => b.createdAt - a.createdAt);

  const accepted = (log ?? []).filter((e) => e.type === "recommendation.accepted");
  const dismissed = (log ?? []).filter((e) => e.type === "recommendation.dismissed");
  const scenarios = (log ?? []).filter((e) => e.type === "scenario.injected");
  const byModule = new Map<string, number>();
  for (const e of accepted) byModule.set(e.module ?? "—", (byModule.get(e.module ?? "—") ?? 0) + 1);
  const moduleBreakdown = [...byModule.entries()].sort((a, b) => b[1] - a[1]);

  const generatedAt = new Date();

  const downloadJson = () => {
    const payload = {
      generatedAt: generatedAt.toISOString(),
      resort: { name: model.name, rooms: model.rooms.length, floors: model.floors.length, assets: model.assets.length },
      simTime: { day: fmtClock(state.t), scenario: state.scenario, seed: state.seed },
      kpis: k,
      decisions: { accepted: accepted.length, dismissed: dismissed.length, scenariosInjected: scenarios.length, byModule: Object.fromEntries(moduleBreakdown) },
      openAlerts: openAlerts.length,
      criticalAlerts: criticalAlerts.map((a) => ({ title: a.title, body: a.body, createdAt: fmtClock(a.createdAt) })),
      decisionLog: log ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shift-summary-${fmtClock(state.t).replace(/[:\s]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!mounted) return <div className="h-full w-full bg-void" />;

  return (
    <div className="h-full w-full overflow-y-auto bg-[#e9edf1]">
      <div className="print:hidden sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-stroke bg-void px-4">
        <Link href="/command" className="flex items-center gap-1.5 text-[12.5px] text-mid hover:text-hi">
          <ArrowLeft size={14} /> Command Center
        </Link>
        <span className="h-5 w-px bg-stroke" />
        <span className="text-[12.5px] text-hi">Shift Summary</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={downloadJson} className="mono flex h-8 items-center gap-1.5 rounded-md border border-stroke-lit px-2.5 text-[12px] text-mid hover:text-hi">
            <Download size={13} /> Download JSON
          </button>
          <button onClick={() => window.print()} className="mono flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-void hover:bg-accent-glow">
            <Printer size={13} /> Export PDF
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] px-6 py-10 print:max-w-none print:p-0">
        <div className="rounded-xl bg-white p-10 text-[#1a2230] shadow-sm print:rounded-none print:p-6 print:shadow-none">
          <header className="flex items-start justify-between border-b border-[#dde3ea] pb-6">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight">Smart Resort 360 — Shift Summary</h1>
              <p className="mt-1 text-[13px] text-[#5b6879]">
                {model.name} · {model.rooms.length} rooms · {model.floors.length} guest floors
              </p>
            </div>
            <div className="text-right text-[11.5px] text-[#5b6879]">
              <div>Generated {generatedAt.toLocaleString()}</div>
              <div>
                Sim time {fmtClock(state.t)} · {state.scenario.replace("-", " ")}
              </div>
            </div>
          </header>

          <section className="mt-6 grid grid-cols-4 gap-4">
            {[
              { label: "Occupancy", value: fmtPct(k.occupancy) },
              { label: "ADR", value: fmtINR(k.adr) },
              { label: "RevPAR", value: fmtINR(k.revpar) },
              { label: "Guest Sat.", value: k.gss.toFixed(2) },
              { label: "Revenue today", value: fmtINR(k.revenueToday) },
              { label: "Energy today", value: `${k.energyToday.toFixed(0)} kWh` },
              { label: "Energy saved", value: fmtINR(k.energySavedToday * COST_PER_KWH) },
              { label: "Open alerts", value: String(openAlerts.length) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-[#e5e9ee] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[#8a95a5]">{s.label}</div>
                <div className="mt-1 text-[18px] font-semibold">{s.value}</div>
              </div>
            ))}
          </section>

          <section className="mt-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#5b6879]">Decisions this session</h2>
            <div className="mt-3 grid grid-cols-3 gap-4 text-[13px]">
              <div>
                <span className="text-[20px] font-semibold text-[#0f9d6a]">{accepted.length}</span> accepted
              </div>
              <div>
                <span className="text-[20px] font-semibold text-[#8a95a5]">{dismissed.length}</span> dismissed
              </div>
              <div>
                <span className="text-[20px] font-semibold text-[#f5a524]">{scenarios.length}</span> demo scenarios injected
              </div>
            </div>
            {moduleBreakdown.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {moduleBreakdown.map(([m, n]) => (
                  <span key={m} className="rounded-full border border-[#e5e9ee] px-3 py-1 text-[11.5px]" style={{ color: moduleMeta[m as ModuleId]?.color }}>
                    {moduleMeta[m as ModuleId]?.label ?? m} · {n}
                  </span>
                ))}
              </div>
            )}
          </section>

          {criticalAlerts.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#5b6879]">Critical alerts open at end of shift</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {criticalAlerts.slice(0, 8).map((a) => (
                  <li key={a.id} className="rounded-lg border-l-2 border-[#f4436c] bg-[#fdf2f4] px-3 py-2 text-[12.5px]">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[#5b6879]">{a.body}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#5b6879]">Full decision log</h2>
            {log === null ? (
              <p className="mt-2 text-[12.5px] text-[#5b6879]">Loading…</p>
            ) : log.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-[#5b6879]">No decisions logged this session.</p>
            ) : (
              <table className="mt-3 w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#dde3ea] text-left text-[#8a95a5]">
                    <th className="pb-1.5 font-normal">Sim time</th>
                    <th className="pb-1.5 font-normal">Module</th>
                    <th className="pb-1.5 font-normal">Action</th>
                    <th className="pb-1.5 font-normal">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e) => (
                    <tr key={e.id} className="border-b border-[#eef1f5]">
                      <td className="py-1.5 text-[#5b6879]">{fmtClock(e.sim_t)}</td>
                      <td className="py-1.5">{e.module ? (moduleMeta[e.module as ModuleId]?.short ?? e.module) : "—"}</td>
                      <td className="py-1.5">{e.type === "recommendation.accepted" ? "Accepted" : e.type === "recommendation.dismissed" ? "Dismissed" : "Scenario"}</td>
                      <td className="py-1.5 text-[#5b6879]">{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <footer className="mt-10 border-t border-[#dde3ea] pt-4 text-[10.5px] leading-relaxed text-[#8a95a5]">
            Every figure above is SIMULATED, MODELED, or DERIVED — see /methodology in the live app for the exact formula and, where one exists, the real-world industry benchmark
            each module is calibrated against. This document reflects a live simulation state at the time of generation, not a static report.
          </footer>
        </div>
      </div>
    </div>
  );
}
