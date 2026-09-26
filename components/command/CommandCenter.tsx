"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useTwin, type LayerId, type ViewMode } from "@/store/twin";
import { useSim } from "@/store/sim";
import { useUi } from "@/store/ui";
import { useSimLoop } from "@/hooks/useSimLoop";
import { useTelegramInbox } from "@/hooks/useTelegramInbox";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { ContextPanel } from "./ContextPanel";
import { BottomDock } from "./BottomDock";
import { ConciergeDock } from "./ConciergeDock";
import { DollhouseHud } from "./DollhouseHud";
import { AskCaption } from "./AskCaption";
import { LoadingOverlay, Palette, HelpSheet } from "./Overlays";
import { DirectorCaptions } from "./DirectorCaptions";
import { MethodologyPanel } from "./MethodologyPanel";
import { Onboarding } from "./Onboarding";
import { cn } from "@/lib/utils";

const TwinCanvas = dynamic(() => import("@/components/twin/TwinCanvas").then((m) => m.TwinCanvas), { ssr: false });

const keyModes: Record<string, ViewMode> = { "1": "orbit", "2": "exploded", "3": "isolate", "4": "xray", "5": "top", "6": "facade", "7": "site" };
const keyLayers: Record<string, LayerId> = { u: "risk", q: "occupancy", w: "maintenance", e: "sentiment", r: "revenue", t: "housekeeping", y: "energy" };

export function CommandCenter() {
  useSimLoop();
  useTelegramInbox();
  const mobilePanel = useUi((s) => s.mobilePanel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const ui = useUi.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const t = useTwin.getState();
      const k = e.key.toLowerCase();
      if (keyModes[e.key]) t.setViewMode(keyModes[e.key]);
      else if (keyLayers[k] && k !== "t") t.setLayer(keyLayers[k]);
      else if (k === "t" && e.shiftKey) t.setLayer("housekeeping");
      else if (k === "t") t.setTour(!t.tourPlaying);
      else if (e.key === "Escape") {
        if (ui.paletteOpen || ui.helpOpen) {
          ui.setPalette(false);
          ui.setHelp(false);
        } else if (t.viewMode === "room") {
          t.setViewMode("isolate");
          t.select(null);
        } else t.select(null);
      } else if (e.key === "?") ui.setHelp(!ui.helpOpen);
      else if (e.key === " ") {
        e.preventDefault();
        const s = useSim.getState();
        s.setPaused(!s.state.paused);
      } else if (e.key === "[" || e.key === "]") {
        const f = t.isolatedFloor ?? 3;
        t.setIsolatedFloor(Math.max(1, Math.min(7, f + (e.key === "]" ? 1 : -1))));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <div className="absolute inset-0">
        <TwinCanvas />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 p-3">
        <TopBar />
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <div className={cn("h-full", mobilePanel === "left" ? "flex" : "hidden xl:flex")}>
            <LeftRail />
          </div>
          <div className="flex h-full min-w-0 flex-1 flex-col items-end justify-end">
            <ConciergeDock />
          </div>
          <div className={cn("h-full", mobilePanel === "right" ? "flex" : "hidden xl:flex")}>
            <ContextPanel />
          </div>
        </div>
        <div className={cn(mobilePanel === "dock" ? "block" : "hidden xl:block")}>
          <BottomDock />
        </div>
        <div className="pointer-events-auto flex gap-1 self-start xl:hidden">
          {(
            [
              ["left", "Views"],
              ["right", "Details"],
              ["dock", "Queue"],
            ] as const
          ).map(([p, label]) => (
            <button key={p} onClick={() => useUi.getState().setMobilePanel(p)} className={cn("glass h-8 rounded-md px-3 text-[12px]", mobilePanel === p ? "text-accent" : "text-mid")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-20">
        <Palette />
        <HelpSheet />
        <LoadingOverlay />
        <DirectorCaptions />
        <DollhouseHud />
        <AskCaption />
        <MethodologyPanel />
        <Onboarding />
      </div>
    </div>
  );
}
