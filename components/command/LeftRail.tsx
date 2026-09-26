"use client";

import Link from "next/link";
import { useState } from "react";
import { Orbit, Layers3, Rows3, ScanLine, Map, Building2, TreePalm, Users, Bell, Tag as TagIcon, Route, Play, Square, ArrowUpRight, Zap, Sparkles } from "lucide-react";
import { routes } from "@/components/analytics/AnalyticsShell";
import { useTwin, layerMeta, type LayerId, type ViewMode } from "@/store/twin";
import { useUi } from "@/store/ui";
import { useDirector } from "@/store/director";
import { getModel } from "@/lib/architecture/model";
import { statusColors, statusLabels } from "@/lib/twin/colors";
import { cn } from "@/lib/utils";

function ScenarioPanel() {
  const model = getModel();
  const ahus = model.assets.filter((a) => a.kind === "ahu");
  const [pick, setPick] = useState(ahus[0]?.id ?? "");
  const stage = useDirector((s) => s.stage);
  const runScenario = useDirector((s) => s.runScenario);
  const reset = useDirector((s) => s.reset);
  const running = stage !== "idle";

  return (
    <div className="glass flex flex-col gap-1.5 p-2">
      <span className="label px-1 pb-1">Scenario</span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        disabled={running}
        className="mono h-8 rounded-md border border-stroke bg-void/60 px-2 text-[12px] text-mid disabled:opacity-50"
      >
        {ahus.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button
        onClick={() => (running ? reset() : pick && runScenario(pick))}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md border px-2 text-[12.5px] transition-colors",
          running ? "border-warm/60 bg-warm/15 text-warm" : "border-stroke text-mid hover:border-stroke-lit hover:text-hi",
        )}
      >
        <Zap size={13} />
        <span className="flex-1 text-left">{running ? "Stop scenario" : "Inject fault"}</span>
      </button>
      <p className="px-1 text-[10.5px] leading-snug text-low">Fails the selected AHU on demand and walks the diagnosis → relocation chain — for demos, not organic wear.</p>
    </div>
  );
}

const modes: { id: ViewMode; label: string; icon: React.ReactNode; key: string }[] = [
  { id: "orbit", label: "Orbit", icon: <Orbit size={15} />, key: "1" },
  { id: "exploded", label: "Exploded", icon: <Layers3 size={15} />, key: "2" },
  { id: "isolate", label: "Floor", icon: <Rows3 size={15} />, key: "3" },
  { id: "xray", label: "X-ray", icon: <ScanLine size={15} />, key: "4" },
  { id: "top", label: "Plan", icon: <Map size={15} />, key: "5" },
  { id: "facade", label: "Facade", icon: <Building2 size={15} />, key: "6" },
  { id: "site", label: "Site", icon: <TreePalm size={15} />, key: "7" },
];

const rampCss: Record<string, string> = {
  cyan: "linear-gradient(90deg,#0a1a2e,#146e6a,#2dd4bf,#5eead4)",
  heat: "linear-gradient(90deg,#14263a,#5b6879,#f5a524,#f4436c)",
  diverging: "linear-gradient(90deg,#f4436c,#5b6879,#2a3647,#34d399)",
};
const layerRamp: Record<LayerId, string> = { risk: "heat", occupancy: "", maintenance: "heat", sentiment: "diverging", revenue: "cyan", housekeeping: "heat", energy: "cyan" };
const layerEnds: Record<LayerId, [string, string]> = { risk: ["low", "critical"], occupancy: ["", ""], maintenance: ["0%", "99%"], sentiment: ["−1", "+1"], revenue: ["₹0", "₹210k"], housekeeping: ["0 min", "45 min"], energy: ["0", "48 kWh"] };

export function LeftRail() {
  const { viewMode, setViewMode, isolatedFloor, setIsolatedFloor, activeLayer, setLayer, showStaff, showAlerts, showLabels, showGuests, toggle, tourPlaying, setTour } = useTwin();
  const autopilot = useUi((s) => s.autopilot);
  const setAutopilot = useUi((s) => s.setAutopilot);
  const floors = getModel().floors.filter((f) => f.kind === "guest").map((f) => f.index);
  const floorMode = viewMode === "isolate" || viewMode === "room";

  return (
    <aside className="scrollbar-thin pointer-events-auto flex h-full w-[220px] shrink-0 flex-col gap-3 overflow-y-auto">
      <div className={cn("glass flex flex-col gap-1.5 p-2", autopilot && "border border-warm/40")}>
        <span className="label px-1 pb-1">Operating mode</span>
        <div className="flex rounded-md bg-white/5 p-0.5">
          <button
            onClick={() => setAutopilot(false)}
            className={cn("flex-1 rounded px-2 py-1.5 text-[11.5px] transition-colors", !autopilot ? "bg-accent/20 text-accent" : "text-low hover:text-hi")}
          >
            Manual
          </button>
          <button
            onClick={() => setAutopilot(true)}
            className={cn("flex-1 rounded px-2 py-1.5 text-[11.5px] transition-colors", autopilot ? "bg-warm/25 text-warm" : "text-low hover:text-hi")}
          >
            Autopilot
          </button>
        </div>
        <p className="px-1 text-[10.5px] leading-snug text-low">
          {autopilot
            ? "Demo mode: every pending recommendation executes itself on a short countdown — real execution, just without the click. Switch back to Manual any time."
            : "Every recommendation waits for a human Accept — the default. Switch to Autopilot for a glimpse of a fully automated resort."}
        </p>
      </div>

      <div className="glass flex flex-col gap-1 p-2">
        <span className="label px-1 pb-1">View</span>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setViewMode(m.id)}
            className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-[12.5px] transition-colors", viewMode === m.id ? "bg-accent/15 text-accent" : "text-mid hover:bg-white/5 hover:text-hi")}
          >
            {m.icon}
            <span className="flex-1 text-left">{m.label}</span>
            <kbd className="mono text-[10px] text-low">{m.key}</kbd>
          </button>
        ))}
        <button
          onClick={() => setTour(!tourPlaying)}
          className={cn("mt-1 flex h-8 items-center gap-2.5 rounded-md border px-2 text-[12.5px] transition-colors", tourPlaying ? "border-accent/60 bg-accent/15 text-accent" : "border-stroke text-mid hover:border-stroke-lit hover:text-hi")}
        >
          {tourPlaying ? <Square size={13} /> : <Play size={13} />}
          <span className="flex-1 text-left">{tourPlaying ? "Stop tour" : "Cinematic tour"}</span>
        </button>
        {floorMode && (
          <div className="mt-1 grid grid-cols-7 gap-1 border-t border-stroke pt-2">
            {floors.map((f) => (
              <button key={f} onClick={() => setIsolatedFloor(f)} className={cn("mono h-7 rounded text-[11px]", isolatedFloor === f ? "bg-accent/20 text-accent" : "bg-white/5 text-mid hover:text-hi")}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass flex flex-col gap-1 p-2">
        <span className="label px-1 pb-1">Data layer</span>
        {(Object.keys(layerMeta) as LayerId[]).map((l) => (
          <button
            key={l}
            onClick={() => setLayer(l)}
            className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] transition-colors", activeLayer === l ? "bg-accent/15 text-accent" : "text-mid hover:bg-white/5 hover:text-hi")}
          >
            <span className="mono w-9 text-[10px] tracking-wider opacity-80">{layerMeta[l].short}</span>
            <span className="flex-1 text-left">{layerMeta[l].label}</span>
          </button>
        ))}
        <div className="mt-1 border-t border-stroke px-1 pt-2">
          <p className="text-[11px] leading-snug text-low">{layerMeta[activeLayer].description}</p>
          {activeLayer === "occupancy" ? (
            <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
              {(Object.keys(statusColors) as (keyof typeof statusColors)[]).map((s) => (
                <li key={s} className="flex items-center gap-1.5 text-[10.5px] text-mid">
                  <span className="h-2 w-2 rounded-sm" style={{ background: statusColors[s] }} />
                  {statusLabels[s]}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full" style={{ background: rampCss[layerRamp[activeLayer]] }} />
              <div className="mono mt-1 flex justify-between text-[10px] text-low">
                <span>{layerEnds[activeLayer][0]}</span>
                <span>{layerEnds[activeLayer][1]}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="glass flex flex-col gap-1 p-2">
        <span className="label px-1 pb-1">Overlays</span>
        {[
          { k: "showStaff" as const, label: "Staff agents", icon: <Users size={14} />, on: showStaff },
          { k: "showAlerts" as const, label: "Alerts", icon: <Bell size={14} />, on: showAlerts },
          { k: "showLabels" as const, label: "Labels", icon: <TagIcon size={14} />, on: showLabels },
          { k: "showGuests" as const, label: "Guest flow", icon: <Route size={14} />, on: showGuests },
        ].map((o) => (
          <button key={o.k} onClick={() => toggle(o.k)} className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[12.5px] text-mid hover:bg-white/5 hover:text-hi">
            {o.icon}
            <span className="flex-1 text-left">{o.label}</span>
            <span className={cn("h-3.5 w-6 rounded-full p-0.5 transition-colors", o.on ? "bg-accent/40" : "bg-white/10")}>
              <span className={cn("block h-2.5 w-2.5 rounded-full bg-hi transition-transform", o.on ? "translate-x-2.5" : "")} />
            </span>
          </button>
        ))}
      </div>

      <div className="glass flex flex-col gap-1.5 p-2">
        <span className="label px-1 pb-1">Planning</span>
        <button
          onClick={() => useUi.getState().setWhatIf(!useUi.getState().whatIfOpen)}
          className="flex h-8 items-center gap-2.5 rounded-md border border-[#f5a524]/40 px-2 text-[12.5px] text-mid transition-colors hover:bg-[#f5a524]/10 hover:text-hi"
        >
          <Sparkles size={13} className="text-[#f5a524]" />
          <span className="flex-1 text-left">What if…</span>
        </button>
        <p className="px-1 text-[10.5px] leading-snug text-low">Project a hypothetical occupancy through the real pricing, staffing and inventory engines — nothing here changes the live sim.</p>
      </div>

      <ScenarioPanel />

      <div className="glass flex flex-col gap-0.5 p-2">
        <span className="label px-1 pb-1">Deep dives</span>
        {routes.map((r) => (
          <Link key={r.href} href={r.href} className="flex h-7 items-center justify-between rounded-md px-2 text-[12.5px] text-mid hover:bg-white/5 hover:text-hi">
            {r.label}
            <ArrowUpRight size={12} className="text-low" />
          </Link>
        ))}
      </div>
    </aside>
  );
}
