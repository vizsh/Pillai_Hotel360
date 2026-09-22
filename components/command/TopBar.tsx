"use client";

import Link from "next/link";
import { Pause, Play, RotateCcw, Gauge, Bell, ChevronDown, Search, HelpCircle, BookOpen, Compass } from "lucide-react";
import { useSim } from "@/store/sim";
import { useUi } from "@/store/ui";
import { useOnboarding } from "@/store/onboarding";
import { useQuality, type QualityTier } from "@/store/quality";
import { fmtClock } from "@/lib/sim/engine";
import type { Scenario } from "@/lib/sim/types";
import { Button, Kbd, Provenance } from "@/components/ui/primitives";
import { DashboardMenu } from "./DashboardMenu";
import { cn, fmtINR, fmtPct } from "@/lib/utils";

const scenarios: { id: Scenario; label: string }[] = [
  { id: "peak-season", label: "Peak Season" },
  { id: "monsoon-lull", label: "Monsoon Lull" },
  { id: "conference-block", label: "Conference Block" },
  { id: "equipment-crisis", label: "Equipment Crisis" },
  { id: "vip-arrival", label: "VIP Arrival" },
];

const speeds = [1, 10, 60, 240];

function Kpi({ label, value, delta, warn }: { label: string; value: string; delta?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col px-3 first:pl-0">
      <span className="label">{label}</span>
      <span className={cn("mono text-[15px] leading-tight", warn ? "text-warm" : "text-hi")}>
        {value}
        {delta && <span className="ml-1 text-[10px] text-low">{delta}</span>}
      </span>
    </div>
  );
}

export function TopBar() {
  const version = useSim((s) => s.version);
  const { state, setPaused, setSpeed, reset } = useSim();
  const { tier, setTier, fps, auto, setAuto } = useQuality();
  void version;
  const k = state.kpis;
  const prev = state.kpiHistory.length > 24 ? state.kpiHistory[state.kpiHistory.length - 25] : null;
  const d = (a: number, b: number | undefined, fmt: (n: number) => string) => (b === undefined ? undefined : `${a - b >= 0 ? "▲" : "▼"} ${fmt(Math.abs(a - b))}`);

  return (
    <header className="glass pointer-events-auto flex h-14 shrink-0 items-center gap-4 overflow-hidden px-4">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent shadow-[0_0_10px_var(--accent)]" />
        </span>
        <div className="flex flex-col whitespace-nowrap leading-none">
          <span className="font-display text-[14px] font-semibold tracking-tight">Smart Resort 360</span>
          <span className="label mt-0.5 text-[9px]">Azure Bay Resort · seed 0x{state.seed.toString(16)}</span>
        </div>
      </Link>

      <div className="mx-2 h-6 w-px bg-stroke" />

      <DashboardMenu />

      <div className="mx-2 h-6 w-px bg-stroke" />

      <div className="flex items-center gap-1">
        <Button size="icon" variant="subtle" onClick={() => setPaused(!state.paused)} aria-label={state.paused ? "Play" : "Pause"}>
          {state.paused ? <Play size={14} /> : <Pause size={14} />}
        </Button>
        <div className="mono ml-1 min-w-[84px] text-[13px] text-hi">{fmtClock(state.t)}</div>
        <div className="ml-1 flex items-center rounded-md bg-white/5 p-0.5">
          {speeds.map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={cn("mono rounded px-2 py-1 text-[11px]", state.speed === s ? "bg-accent/20 text-accent" : "text-low hover:text-hi")}>
              {s}×
            </button>
          ))}
        </div>
        <div className="relative ml-1">
          <select value={state.scenario} onChange={(e) => reset(e.target.value as Scenario)} className="h-8 appearance-none rounded-md border border-stroke bg-transparent pl-2.5 pr-7 text-[12px] text-hi outline-none hover:border-stroke-lit">
            {scenarios.map((s) => (
              <option key={s.id} value={s.id} className="bg-deep">
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-low" />
        </div>
        <Button size="icon" variant="ghost" onClick={() => reset()} aria-label="Reset scenario" title="Reset scenario">
          <RotateCcw size={14} />
        </Button>
      </div>

      <div className="mx-2 h-6 w-px bg-stroke" />

      <div className="flex flex-1 items-center divide-x divide-stroke">
        <Kpi label="Occupancy" value={fmtPct(k.occupancy)} delta={d(k.occupancy, prev?.occupancy, (n) => fmtPct(n))} />
        <Kpi label="ADR" value={fmtINR(k.adr)} delta={d(k.adr, prev?.adr, (n) => fmtINR(n))} />
        <Kpi label="RevPAR" value={fmtINR(k.revpar)} delta={d(k.revpar, prev?.revpar, (n) => fmtINR(n))} />
        <Kpi label="Guest Sat" value={k.gss.toFixed(2)} delta={d(k.gss, prev?.gss, (n) => n.toFixed(2))} warn={k.gss < 3.8} />
        <Kpi label="Requests" value={String(k.openRequests)} warn={k.openRequests > 8} />
        <Kpi label="On Shift" value={String(k.staffOnShift)} />
        <div className="flex items-center gap-1.5 px-3">
          <Bell size={13} className={k.openAlerts ? "text-warm" : "text-low"} />
          <span className={cn("mono text-[15px]", k.openAlerts ? "text-warm" : "text-hi")}>{k.openAlerts}</span>
          <span className="label">alerts</span>
        </div>
        <div className="px-3">
          <Provenance />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => useUi.getState().setPalette(true)} className="flex h-8 items-center gap-2 rounded-md border border-stroke px-2.5 text-[12px] text-mid hover:border-stroke-lit hover:text-hi">
          <Search size={13} />
          Search
          <Kbd>⌘K</Kbd>
        </button>
        <button onClick={() => useOnboarding.getState().start()} className="grid h-8 w-8 place-items-center rounded-md text-low hover:bg-white/5 hover:text-hi" aria-label="Replay intro" title="Replay intro">
          <Compass size={14} />
        </button>
        <button onClick={() => useUi.getState().openMethodology("pricing")} className="grid h-8 w-8 place-items-center rounded-md text-low hover:bg-white/5 hover:text-hi" aria-label="Methodology" title="How every number is calculated">
          <BookOpen size={14} />
        </button>
        <button onClick={() => useUi.getState().setHelp(true)} className="grid h-8 w-8 place-items-center rounded-md text-low hover:bg-white/5 hover:text-hi" aria-label="Keyboard shortcuts">
          <HelpCircle size={14} />
        </button>
        <Gauge size={13} className="text-low" />
        <span className={cn("mono text-[11px]", fps < 40 ? "text-warm" : "text-low")}>{fps} fps</span>
        <select
          value={auto ? "auto" : tier}
          onChange={(e) => (e.target.value === "auto" ? setAuto(true) : setTier(e.target.value as QualityTier))}
          className="h-7 rounded-md border border-stroke bg-transparent px-2 text-[11px] text-mid outline-none"
        >
          <option value="auto" className="bg-deep">
            auto · {tier}
          </option>
          {(["ultra", "high", "balanced", "potato"] as QualityTier[]).map((t) => (
            <option key={t} value={t} className="bg-deep">
              {t}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
