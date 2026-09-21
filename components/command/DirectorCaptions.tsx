"use client";

import { Radar, X } from "lucide-react";
import { useDirector, type DirectorStage } from "@/store/director";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const stageLabel: Record<DirectorStage, string> = {
  idle: "",
  injected: "FAULT INJECTED",
  tracing: "DIAGNOSING",
  diagnosed: "ROOT CAUSE CONFIRMED",
  "awaiting-accept": "RECOMMENDATION READY",
  executing: "EXECUTING",
  resolved: "RESOLVED",
};

export function DirectorCaptions() {
  const stage = useDirector((s) => s.stage);
  const narration = useDirector((s) => s.narration);
  const reset = useDirector((s) => s.reset);
  if (stage === "idle") return null;

  return (
    <div className="pointer-events-none absolute bottom-[248px] left-1/2 z-30 w-full max-w-[520px] -translate-x-1/2 px-3">
      <div className="glass pointer-events-auto flex items-center gap-3 rounded-lg border border-accent/40 px-4 py-2.5 shadow-[0_0_30px_-8px_var(--accent)]">
        <Radar size={16} className={cn("shrink-0 text-accent", (stage === "tracing" || stage === "injected") && "animate-pulse")} />
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] tracking-wider text-accent">{stageLabel[stage]}</div>
          <div className="truncate text-[12.5px] text-hi">{narration}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={reset} aria-label="Dismiss scenario">
          <X size={13} />
        </Button>
      </div>
    </div>
  );
}
