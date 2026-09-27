"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { useSim } from "@/store/sim";
import { getModel } from "@/lib/architecture/model";
import { archetypeFor, playbookRecommendations, PLAYBOOKS } from "@/lib/intelligence/weatherPlaybook";
import { forecastWeather } from "@/lib/intelligence/weather";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { Provenance } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Feature C — turns the cascade from a prediction into a one-click preparation. The checklist
 * is a named playbook per weather archetype; "Prepare the resort" batches every currently
 * pending weather/staffing/energy recommendation through the exact same acceptRecommendation()
 * every other Accept button in the app calls — nothing here is a new automated action, only a
 * bundle of the real ones. */
export function PlaybookCard() {
  const { state, mutate } = useSim();
  useSim((s) => s.version);
  const model = getModel();
  const [done, setDone] = useState(false);
  const today = forecastWeather(state)[0];
  const archetype = archetypeFor(today.condition, today.rainProbability);
  const playbook = PLAYBOOKS[archetype];
  const bundle = playbookRecommendations(state, model);

  const prepare = () => {
    for (const rec of bundle) acceptRecommendation(mutate, model, rec);
    setDone(true);
    setTimeout(() => setDone(false), 4000);
  };

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-deep/70 p-4", archetype === "clear" ? "border-stroke" : "border-[#f5a524]/30")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={14} className="text-[#f5a524]" />
          <span className="font-display text-[14.5px] font-semibold text-hi">{playbook.title}</span>
        </div>
        <Provenance kind="modeled" />
      </div>
      <ul className="flex flex-col gap-1.5">
        {playbook.checklist.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-mid">
            <span className="mono mt-0.5 text-[9px] text-low">{String(i + 1).padStart(2, "0")}</span>
            {item}
          </li>
        ))}
      </ul>
      {archetype !== "clear" && (
        <div className="flex items-center justify-between rounded-lg border border-stroke bg-white/[0.02] px-3 py-2">
          <span className="text-[11px] text-mid">
            {bundle.length > 0 ? `${bundle.length} pending recommendation${bundle.length > 1 ? "s" : ""} implement this playbook` : "No matching recommendations are pending right now"}
          </span>
          <button
            onClick={prepare}
            disabled={!bundle.length}
            className="mono flex items-center gap-1.5 rounded-md border border-[#f5a524]/50 bg-[#f5a524]/10 px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-[#f5a524] disabled:opacity-40"
          >
            {done ? (
              <>
                <CheckCircle2 size={12} /> Prepared
              </>
            ) : (
              "Prepare the resort"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
