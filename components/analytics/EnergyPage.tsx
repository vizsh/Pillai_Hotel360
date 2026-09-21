"use client";

import Link from "next/link";
import { Leaf, Camera } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { assessEnergyWaste } from "@/lib/intelligence/energy";
import { acceptRecommendation, dismissRecommendationLogged } from "@/lib/api/recommendationActions";
import type { Recommendation } from "@/lib/sim/types";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Button, Provenance, Stat, Tag } from "@/components/ui/primitives";

const COST_PER_KWH = 9;

function RecRow({ rec, model, mutate }: { rec: Recommendation | undefined; model: ReturnType<typeof getModel>; mutate: (fn: (s: import("@/lib/sim/types").SimState) => void) => void; emptyText?: string }) {
  const pending = rec?.status === "pending" ? rec : null;
  if (!pending) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-t border-stroke/60 py-3 first:border-t-0 first:pt-0">
      <div>
        <div className="text-[13px] font-medium text-hi">{pending.title}</div>
        <p className="mt-1 max-w-[640px] text-[12px] leading-snug text-mid">{pending.body}</p>
        <p className="mt-1.5 text-[11.5px] text-accent/90">{pending.impact}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="primary" onClick={() => acceptRecommendation(mutate, model, pending)}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dismissRecommendationLogged(mutate, pending)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function EnergyPage() {
  const { state, mutate } = useSim();
  const model = getModel();
  const a = assessEnergyWaste(state, model);
  const vacantRec = state.recommendations["rec-energy-vacant-conditioning"];
  const awayRec = state.recommendations["rec-energy-away-mode"];
  const savedToday = state.kpis.energySavedToday;
  const anyPending = vacantRec?.status === "pending" || awayRec?.status === "pending";

  return (
    <AnalyticsShell
      title="Energy Intelligence"
      subtitle="Vacant rooms drawing full conditioning load, plus checked-in rooms a camera feed shows are actually empty right now — flagged and released automatically. Industry data puts vacancy-conditioning waste at 35-40% of hotel HVAC spend; this module targets that band from two signals, PMS occupancy and camera presence, live on this property."
    >
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Vacant & still conditioned" value={String(a.candidates.length)} accent={a.candidates.length > 0 ? "var(--warm)" : undefined} />
        <Stat label="Occupied but guest away" value={String(a.awayCandidates.length)} sub="camera presence < 15%" accent={a.awayCandidates.length > 0 ? "var(--warm)" : undefined} />
        <Stat label="Rooms under management" value={String(a.managedCount + a.ecoCount)} accent="var(--accent)" />
        <Stat label="Saved today" value={`₹${Math.round(savedToday * COST_PER_KWH).toLocaleString("en-IN")}`} sub={`${savedToday.toFixed(1)} kWh`} accent="var(--accent)" />
      </div>

      <Card title="Recommendations" right={<Provenance kind="modeled" />}>
        {anyPending ? (
          <div className="flex flex-col">
            <RecRow rec={vacantRec} model={model} mutate={mutate} />
            <RecRow rec={awayRec} model={model} mutate={mutate} />
          </div>
        ) : (
          <p className="text-[12px] text-low">No conditioned-waste recommendation right now — either nothing qualifies, or everything eligible is already under management.</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title={`Vacant rooms still conditioned (${a.candidates.length})`}>
          {a.candidates.length === 0 ? (
            <p className="text-[12px] text-low">None — every vacant room is already unconditioned.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="label text-left">
                <tr>
                  <th className="pb-2 font-normal">Room</th>
                  <th className="pb-2 font-normal">Status</th>
                  <th className="pb-2 font-normal">Waste rate</th>
                  <th className="pb-2 font-normal"></th>
                </tr>
              </thead>
              <tbody className="mono">
                {a.candidates.map((r) => {
                  const cell = model.roomById.get(r.id)!;
                  return (
                    <tr key={r.id} className="border-t border-stroke/60">
                      <td className="py-2">
                        <Link href="/command" onClick={() => useTwin.getState().select({ kind: "room", id: r.id })} className="text-hi hover:text-accent">
                          {cell.number}
                        </Link>
                      </td>
                      <td className="py-2">
                        <Tag color="#f5a524">{r.status}</Tag>
                      </td>
                      <td className="py-2 text-mid">1.37 kWh/h</td>
                      <td className="py-2 text-right">
                        <Leaf size={13} className="ml-auto text-low" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`Occupied, guest away · CCTV (${a.awayCandidates.length})`} right={<Provenance />}>
          {a.awayCandidates.length === 0 ? (
            <p className="text-[12px] text-low">No checked-in room currently reads as empty on camera.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="label text-left">
                <tr>
                  <th className="pb-2 font-normal">Room</th>
                  <th className="pb-2 font-normal">Presence</th>
                  <th className="pb-2 font-normal">Eco delta</th>
                  <th className="pb-2 font-normal"></th>
                </tr>
              </thead>
              <tbody className="mono">
                {a.awayCandidates.map((r) => {
                  const cell = model.roomById.get(r.id)!;
                  return (
                    <tr key={r.id} className="border-t border-stroke/60">
                      <td className="py-2">
                        <Link href="/command" onClick={() => useTwin.getState().select({ kind: "room", id: r.id })} className="text-hi hover:text-accent">
                          {cell.number}
                        </Link>
                      </td>
                      <td className="py-2 text-warm">{(r.presence * 100).toFixed(0)}%</td>
                      <td className="py-2 text-mid">0.95 kWh/h</td>
                      <td className="py-2 text-right">
                        <Camera size={13} className="ml-auto text-low" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AnalyticsShell>
  );
}
