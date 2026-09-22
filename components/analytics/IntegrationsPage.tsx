"use client";

import { useState } from "react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { buildAdapterContracts } from "@/lib/adapters/simulatedSource";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Tag, Provenance } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function IntegrationsPage() {
  const { state } = useSim();
  useSim((s) => s.version);
  const model = getModel();
  const contracts = buildAdapterContracts(state, model);
  const [open, setOpen] = useState<string>(contracts[0].id);

  return (
    <AnalyticsShell
      title="Integrations"
      subtitle="Every module in this system reads one internal state shape (SimState) and nothing else. Today that shape is written by the seeded simulator; in a live deployment it would be written by real webhooks in these exact payload shapes — no change to any intelligence module required. This page shows the contract, not a mockup: the JSON below is generated live from the current simulation by the same mapping functions a real ingestion service would use."
    >
      <div className="grid grid-cols-3 gap-4">
        {contracts.map((c) => (
          <button key={c.id} onClick={() => setOpen(c.id)} className={cn("rounded-xl border p-4 text-left transition-colors", open === c.id ? "border-accent/60 bg-accent/5" : "border-stroke bg-deep/70 hover:border-stroke-lit")}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-hi">{c.label}</span>
              <Provenance />
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-mid">{c.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.vendorExamples.map((v) => (
                <Tag key={v}>{v}</Tag>
              ))}
            </div>
          </button>
        ))}
      </div>

      {contracts
        .filter((c) => c.id === open)
        .map((c) => (
          <Card key={c.id} title={`Sample payload — ${c.label}`} right={<span className="mono text-[10px] text-low">live, regenerated every render</span>}>
            <pre className="scrollbar-thin max-h-[420px] overflow-auto rounded-lg bg-void/60 p-4 text-[11.5px] leading-relaxed text-accent/90">
              {JSON.stringify(c.sample(), null, 2)}
            </pre>
          </Card>
        ))}

      <Card title="How this plugs in">
        <div className="grid grid-cols-3 gap-4 text-[12px] leading-relaxed text-mid">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-hi">Today</div>
            lib/sim/seed.ts and lib/sim/engine.ts populate SimState directly from a seeded random-but-deterministic generator. Every intelligence module in lib/intelligence/* reads only SimState — never the seed/tick logic.
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-hi">The seam</div>
            lib/adapters/types.ts defines the exact payload shape each real system would send. lib/adapters/simulatedSource.ts maps current SimState into those shapes — proving they&apos;re satisfiable with real data, not aspirational.
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-hi">In production</div>
            A small ingestion service receives these same payloads over webhook/MQTT and writes them into the identical SimState shape. No intelligence module, recommendation, or UI component changes.
          </div>
        </div>
      </Card>
    </AnalyticsShell>
  );
}
