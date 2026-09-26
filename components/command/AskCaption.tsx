"use client";

import { Sparkles, X } from "lucide-react";
import { useTwin } from "@/store/twin";
import { Button } from "@/components/ui/primitives";

/** The visible half of the "show me" feature (lib/twin/queries.ts): the camera already moved
 * and Markers.tsx is already pulsing a beacon over every matched room by the time this
 * renders — this is just the caption naming what happened and why, so "the AI acted on the
 * 3D scene" reads as an answer, not an unexplained camera jump. Triggered identically by the
 * Ctrl+K palette (Overlays.tsx) and the ops assistant (AssistantPage.tsx) — same store field,
 * same component, so the feature behaves the same whether it was typed or asked. */
export function AskCaption() {
  const caption = useTwin((s) => s.askCaption);
  const dismiss = useTwin((s) => s.dismissAsk);
  if (!caption) return null;

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-full max-w-[560px] -translate-x-1/2 px-3">
      <div className="glass pointer-events-auto flex items-center gap-3 rounded-lg border border-[#c084fc]/40 px-4 py-2.5 shadow-[0_0_30px_-8px_#c084fc]">
        <Sparkles size={16} className="shrink-0 text-[#c084fc]" />
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] tracking-wider text-[#c084fc]">SHOWING YOU</div>
          <div className="text-[12.5px] text-hi">{caption}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={dismiss} aria-label="Dismiss">
          <X size={13} />
        </Button>
      </div>
    </div>
  );
}
