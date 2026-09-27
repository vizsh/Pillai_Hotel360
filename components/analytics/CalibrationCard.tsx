"use client";

import { useState } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { assimilateWetDay } from "@/lib/intelligence/weatherWhatIf";
import { calibrationSummary, resetLearning } from "@/lib/intelligence/weatherLearner";
import { Provenance } from "@/components/ui/primitives";

/** The twin's continuous learning, made visible: a belief about how strongly rain lifts F&B spend starts at a
 * documented prior and is updated from what the simulated property actually does on wet ticks (Bayesian
 * data assimilation). The chart shows the posterior mean with a 95% band tightening as evidence arrives;
 * the dashed line is the simulator's hidden true sensitivity, shown only because the property is simulated,
 * so the recovery can be checked. Projections (what-if, outlook, cascade) use the learned belief. */
const CW = 900;
const CH = 150;

export function CalibrationCard() {
  const { state } = useSim();
  useSim((s) => s.version);
  const [busy, setBusy] = useState(false);
  const c = calibrationSummary(state);
  const model = getModel();

  const run = () => {
    setBusy(true);
    // Defer so the button state paints before the (synchronous) 96-tick replay runs.
    setTimeout(() => {
      assimilateWetDay(useSim.getState().state, model);
      useSim.getState().bump();
      setBusy(false);
    }, 30);
  };
  const reset = () => {
    resetLearning(useSim.getState().state);
    useSim.getState().bump();
  };

  const pts = c.history.length ? c.history : [];
  const maxN = Math.max(120, ...pts.map((p) => p.n));
  const lo = 0.1;
  const hi = 0.7;
  const X = (n: number) => 8 + (n / maxN) * (CW - 16);
  const Y = (v: number) => CH - 8 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (CH - 16);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.n)} ${Y(p.mean)}`).join(" ");
  const band = pts.length ? `${pts.map((p, i) => `${i ? "L" : "M"}${X(p.n)} ${Y(p.mean + 1.96 * p.sd)}`).join(" ")} ${[...pts].reverse().map((p) => `L${X(p.n)} ${Y(p.mean - 1.96 * p.sd)}`).join(" ")} Z` : "";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#2dd4bf]/30 bg-deep/70 p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-[14.5px] font-semibold text-hi">Twin calibration — it keeps learning</span>
        <Provenance kind="modeled" />
      </div>
      <p className="text-[11px] leading-relaxed text-mid">
        The twin&rsquo;s belief about how much rain lifts indoor F&amp;B spend starts from a documented prior and is updated from what the property actually does on wet ticks. Better calibration means better projections — the what-if, outlook and cascade all use the learned value.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Prior belief" value={`${c.priorSlope.toFixed(2)} ± ${(1.96 * c.priorSd).toFixed(2)}`} sub="documented default" />
        <Stat label="Learned belief" value={`${c.learned.mean.toFixed(2)} ± ${(1.96 * c.learned.sd).toFixed(2)}`} sub={`${c.learned.n} wet-tick observations`} accent />
        <Stat label="Simulator truth" value={c.simulatorTruthSlope.toFixed(2)} sub="hidden; for verification only" />
      </div>

      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full rounded-lg border border-stroke bg-black/20" role="img" aria-label="Learned coefficient over observations">
        <line x1={8} x2={CW - 8} y1={Y(c.priorSlope)} y2={Y(c.priorSlope)} stroke="#7a8494" strokeDasharray="2 4" />
        <line x1={8} x2={CW - 8} y1={Y(c.simulatorTruthSlope)} y2={Y(c.simulatorTruthSlope)} stroke="#f5a524" strokeDasharray="6 4" />
        {band && <path d={band} fill="#2dd4bf" opacity={0.15} />}
        {line && <path d={line} fill="none" stroke="#2dd4bf" strokeWidth={2} />}
        <text x={12} y={Y(c.priorSlope) - 4} className="fill-[#7a8494]" style={{ fontSize: 11 }}>prior</text>
        <text x={CW - 12} y={Y(c.simulatorTruthSlope) - 4} textAnchor="end" fill="#f5a524" style={{ fontSize: 11 }}>simulator truth</text>
        {!pts.length && (
          <text x={CW / 2} y={CH / 2} textAnchor="middle" className="fill-[#7a8494]" style={{ fontSize: 13 }}>
            No wet-day observations yet — assimilate one below
          </text>
        )}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="mono text-[10.5px] text-mid">
          {c.learned.n > 0 ? (
            <>
              belief error vs truth: {Math.abs(c.priorSlope - c.simulatorTruthSlope).toFixed(3)} before learning → <span className="text-positive">{Math.abs(c.learned.mean - c.simulatorTruthSlope).toFixed(3)}</span> now
            </>
          ) : (
            "belief error appears after the first observations"
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={run} disabled={busy} className="rounded-md border border-[#2dd4bf]/50 bg-[#2dd4bf]/10 px-2.5 py-1.5 text-[10.5px] text-[#2dd4bf] disabled:opacity-50">
            {busy ? "Assimilating…" : "Assimilate a wet day (96 observations)"}
          </button>
          <button onClick={reset} className="rounded-md border border-stroke px-2.5 py-1.5 text-[10.5px] text-low hover:text-hi">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-[#2dd4bf]/40 bg-[#2dd4bf]/5" : "border-stroke bg-white/[0.02]"}`}>
      <div className="text-[9.5px] uppercase tracking-wider text-low">{label}</div>
      <div className="mono text-[14px] font-medium text-hi">{value}</div>
      <div className="text-[9.5px] text-low">{sub}</div>
    </div>
  );
}
