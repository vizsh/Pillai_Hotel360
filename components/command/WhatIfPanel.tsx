"use client";

import { useMemo, useState } from "react";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { runWhatIf } from "@/lib/intelligence/whatIf";
import { fmtINR, fmtPct, cn } from "@/lib/utils";
import { Provenance } from "@/components/ui/primitives";

const PRESETS = [
  { label: "Quiet night", value: 0.3 },
  { label: "Typical", value: 0.65 },
  { label: "Busy weekend", value: 0.9 },
  { label: "Sold out", value: 0.99 },
];

function Row({ label, before, after, fmt, betterIsHigher, sub }: { label: string; before: number; after: number; fmt: (n: number) => string; betterIsHigher: boolean; sub?: string }) {
  const delta = after - before;
  const improved = betterIsHigher ? delta > 0 : delta < 0;
  const worse = betterIsHigher ? delta < 0 : delta > 0;
  return (
    <div className="flex items-center justify-between rounded-lg border border-stroke bg-white/[0.02] px-3 py-2.5">
      <div>
        <div className="text-[12px] text-hi">{label}</div>
        {sub && <div className="text-[10.5px] text-low">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className="mono text-[13px] text-low">{fmt(before)}</span>
        <ArrowRight size={12} className="text-low" />
        <span className={cn("mono text-[15px] font-medium", improved ? "text-positive" : worse ? "text-critical" : "text-hi")}>{fmt(after)}</span>
      </div>
    </div>
  );
}

/** A pure projection panel — reads the live state, never mutates it. Every number below
 * comes from re-running the exact same production functions the live dashboard uses
 * (lib/intelligence/whatIf.ts's own header explains why that's the correct way to build a
 * "what if" feature rather than a parallel toy model), fed a hypothetical occupancy instead
 * of the real one. Closing this panel or moving the slider changes nothing about the actual
 * simulation — it's a forecast a GM would run before a decision, not a decision itself. */
export function WhatIfPanel({ onClose }: { onClose: () => void }) {
  const { state } = useSim();
  useSim((s) => s.version);
  const model = getModel();
  const currentOcc = state.kpis.occupancy;
  const [target, setTarget] = useState(() => Math.min(0.99, currentOcc + 0.15));

  const result = useMemo(() => runWhatIf(state, model, target), [state, model, target]);

  return (
    <div className="glass pointer-events-auto absolute right-3 top-[74px] z-30 w-[380px] overflow-hidden rounded-xl border border-[#f5a524]/30 shadow-[0_0_40px_-12px_#f5a524]">
      <div className="flex items-center justify-between border-b border-stroke px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#f5a524]" />
          <span className="font-display text-[14.5px] font-semibold text-hi">What if occupancy hits {fmtPct(target)}?</span>
        </div>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-low hover:bg-white/5 hover:text-hi" aria-label="Close">
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-3.5">
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-low">
            <span>Today: {fmtPct(currentOcc)}</span>
            <span>Hypothetical: {fmtPct(target)}</span>
          </div>
          <input
            type="range"
            min={5}
            max={99}
            value={Math.round(target * 100)}
            onChange={(e) => setTarget(Number(e.target.value) / 100)}
            className="w-full accent-[#f5a524]"
            aria-label="Hypothetical occupancy"
          />
          <div className="mt-2 flex gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setTarget(p.value)}
                className={cn(
                  "flex-1 rounded-md border px-1.5 py-1 text-[10px] transition-colors",
                  Math.abs(target - p.value) < 0.005 ? "border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524]" : "border-stroke text-low hover:text-hi",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <Row label="Recommended RevPAR" sub="Same demand-curve engine the Revenue page uses" before={result.pricing.revparBefore} after={result.pricing.revparAfter} fmt={fmtINR} betterIsHigher />
        <Row label="Recommended ADR" sub="Constant-elasticity RevPAR optimum" before={result.pricing.adrBefore} after={result.pricing.adrAfter} fmt={fmtINR} betterIsHigher />
        <Row label="Unmet staffing (shifts)" sub="Same roster solver as the Operations page" before={result.staffing.unmetBefore} after={result.staffing.unmetAfter} fmt={(n) => n.toFixed(0)} betterIsHigher={false} />
        <Row label="Staffing cost pressure" before={result.staffing.costBefore} after={result.staffing.costAfter} fmt={(n) => n.toFixed(0)} betterIsHigher={false} />
        <Row label="Items needing reorder" sub="Same Holt forecast + EOQ as the Inventory page" before={result.inventory.reorderCountBefore} after={result.inventory.reorderCountAfter} fmt={(n) => n.toFixed(0)} betterIsHigher={false} />
        <Row label="Total reorder quantity" before={result.inventory.reorderQtyBefore} after={result.inventory.reorderQtyAfter} fmt={(n) => n.toLocaleString()} betterIsHigher={false} />

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] leading-relaxed text-low">Every number above is computed live, not looked up — moving the slider re-runs the real pricing, staffing and inventory modules.</p>
          <Provenance kind="modeled" />
        </div>
      </div>
    </div>
  );
}
