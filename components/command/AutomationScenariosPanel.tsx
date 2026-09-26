"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap, Play, ChevronLeft } from "lucide-react";
import { useUi } from "@/store/ui";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { moduleMeta } from "@/lib/intelligence/registry";
import { handleGuestMessage } from "@/lib/intelligence/concierge";
import { applyGuestAppOrder } from "@/lib/sim/actions";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { refreshRecommendations } from "@/lib/sim/engine";
import { SCENARIOS, triggerSoftMaintenanceIssue, triggerAssetFailure, pickOccupiedRoom, type ScenarioDef } from "@/lib/sim/scenarioCatalog";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { Button, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const BRIEF_SECONDS = 4;

type Step = "list" | "brief" | "running" | "resolved" | "miss";

/** Reads out loud (via the twin's ask caption + this panel) exactly what a real accept/execute
 * already does — no scripted outcome text, the sentence below is built from the actual
 * recommendation/request object the module produced. */
function outcomeFor(rec: Recommendation | null, fallback: string): string {
  if (!rec) return fallback;
  return `${rec.action} ${rec.impact ? `— ${rec.impact}` : ""}`.trim();
}

function findMatch(state: SimState, scn: ScenarioDef): Recommendation | null {
  const candidates = Object.values(state.recommendations).filter((r) => r.status === "pending" && r.module === scn.module && (!scn.match || scn.match(r)));
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

export function AutomationScenariosPanel() {
  const open = useUi((s) => s.scenarioPanelOpen);
  const [step, setStep] = useState<Step>("list");
  const [scn, setScn] = useState<ScenarioDef | null>(null);
  const [remaining, setRemaining] = useState(BRIEF_SECONDS);
  const [outcome, setOutcome] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const model = getModel();

  const close = () => {
    useUi.getState().setScenarioPanelOpen(false);
    setStep("list");
    setScn(null);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const pick = (s: ScenarioDef) => {
    setScn(s);
    setStep("brief");
    setRemaining(BRIEF_SECONDS);
  };

  const run = (s: ScenarioDef) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStep("running");
    const mutate = useSim.getState().mutate;

    window.setTimeout(() => {
      let result: { ok: true; roomOrAsset: { kind: "room" | "asset"; id: string }; rec: Recommendation | null; text?: string } | { ok: false } = { ok: false };

      if (s.kind === "asset-soft") {
        let assetId: string | null = null;
        mutate((st) => {
          assetId = triggerSoftMaintenanceIssue(st, model);
        });
        if (assetId) {
          const rec = useSim.getState().state.recommendations[`rec-maint-${assetId}`] ?? null;
          result = { ok: true, roomOrAsset: { kind: "asset", id: assetId }, rec };
        }
      } else if (s.kind === "asset-failure") {
        let assetId: string | null = null;
        mutate((st) => {
          assetId = triggerAssetFailure(st, model);
        });
        if (assetId) {
          const relocRec = Object.values(useSim.getState().state.recommendations).find((r) => r.module === "relocation" && r.targetId === assetId && r.status === "pending") ?? null;
          result = { ok: true, roomOrAsset: { kind: "asset", id: assetId }, rec: relocRec, text: relocRec ? undefined : "Emergency repair dispatched — no occupied rooms were affected on this pass." };
        }
      } else if (s.kind === "guest-message") {
        const target = pickOccupiedRoom(useSim.getState().state, model);
        if (target) {
          let requestId: string | undefined;
          let intent = "";
          mutate((st) => {
            const r = handleGuestMessage(st, model, target.id, "The AC in my room isn't working and it's really hot, can someone come now please");
            requestId = r.requestId;
            intent = r.classified.intent;
          });
          const req = requestId ? useSim.getState().state.requests[requestId] : null;
          result = { ok: true, roomOrAsset: { kind: "room", id: target.id }, rec: null, text: req ? `Classified as "${intent}" and dispatched to ${req.type} — SLA ${req.slaMin} min.` : "Classified as smalltalk/info — no ticket was needed." };
        }
      } else if (s.kind === "guest-app-order") {
        const target = pickOccupiedRoom(useSim.getState().state, model);
        if (target) {
          let guestName = "Guest";
          mutate((st) => {
            const g = st.rooms[target.id]?.guestId ? st.guests[st.rooms[target.id].guestId!] : null;
            guestName = g?.name ?? "Guest";
            applyGuestAppOrder(st, model, target.id, guestName, "room_service", "Room service (guest app): 2x Club Sandwich, 1x Coffee");
          });
          result = { ok: true, roomOrAsset: { kind: "room", id: target.id }, rec: null, text: `${guestName}'s order dispatched to F&B — attributed to the guest app, not a phone call.` };
        }
      } else {
        mutate((st) => refreshRecommendations(st, model));
        const rec = findMatch(useSim.getState().state, s);
        if (rec) {
          const sel = rec.targetKind === "room" || rec.targetKind === "asset" ? { kind: rec.targetKind as "room" | "asset", id: rec.targetId } : { kind: "room" as const, id: model.rooms[0].id };
          result = { ok: true, roomOrAsset: sel, rec };
        }
      }

      if (!result.ok) {
        setStep("miss");
        return;
      }

      const sel = result.roomOrAsset;
      useTwin.getState().select(sel);
      const label = result.rec ? outcomeFor(result.rec, "") : (result.text ?? "");
      const captionRoomId =
        sel.kind === "room" ? sel.id : (model.rooms.find((r) => model.assetById.get(sel.id)?.servesFloors.includes(r.floor))?.id ?? model.rooms[0].id);
      useTwin.getState().ask([captionRoomId], `AUTOMATED · ${s.title}`, "SCENARIO");

      window.setTimeout(() => {
        if (result.ok && result.rec && result.rec.status === "pending") {
          acceptRecommendation(useSim.getState().mutate, model, result.rec);
          setOutcome(outcomeFor(useSim.getState().state.recommendations[result.rec.id] ?? result.rec, label));
        } else {
          setOutcome(label || "Action applied.");
        }
        setStep("resolved");
      }, 1200);
    }, 350);
  };

  useEffect(() => {
    if (step !== "brief" || !scn) return;
    const deadline = Date.now() + BRIEF_SECONDS * 1000;
    timerRef.current = setInterval(() => {
      const left = (deadline - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        run(scn);
        return;
      }
      setRemaining(left);
    }, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scn]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-void/70 backdrop-blur-sm" role="dialog" aria-label="Automation scenarios">
      <div className="glass flex max-h-[80vh] w-[720px] flex-col p-5">
        <div className="mb-3 flex items-center gap-2">
          {step !== "list" && (
            <Button size="icon" variant="ghost" onClick={() => setStep("list")} aria-label="Back to scenario list">
              <ChevronLeft size={14} />
            </Button>
          )}
          <Zap size={15} className="text-warm" />
          <span className="text-[14px] font-medium text-hi">Automation scenarios</span>
          <span className="text-[11px] text-low">— demonstration only, each one runs the real detection + decision logic</span>
          <Button size="icon" variant="ghost" className="ml-auto" onClick={close} aria-label="Close">
            <X size={14} />
          </Button>
        </div>

        {step === "list" && (
          <div className="scrollbar-thin grid grid-cols-2 gap-2 overflow-y-auto pr-1">
            {SCENARIOS.map((s) => {
              const meta = moduleMeta[s.module];
              return (
                <button key={s.id} onClick={() => pick(s)} className="flex flex-col gap-1 rounded-lg border border-stroke bg-white/[0.02] p-3 text-left hover:border-stroke-lit hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <Tag color={meta.color}>{meta.short}</Tag>
                  </div>
                  <span className="text-[12.5px] font-medium leading-snug text-hi">{s.title}</span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-mid">{s.situation}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === "brief" && scn && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag color={moduleMeta[scn.module].color}>{moduleMeta[scn.module].short}</Tag>
              <span className="text-[15px] font-medium text-hi">{scn.title}</span>
            </div>
            <div className="flex flex-col gap-2 text-[12.5px] leading-snug">
              <p><span className="text-low">Situation — </span><span className="text-mid">{scn.situation}</span></p>
              <p><span className="text-low">Detection — </span><span className="text-mid">{scn.detection}</span></p>
              <p><span className="text-low">Reasoning — </span><span className="text-mid">{scn.reasoning}</span></p>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <Button size="sm" variant="primary" onClick={() => run(scn)}>
                <Play size={12} /> Run now
              </Button>
              <span className="mono text-[11px] text-warm">auto-running in {Math.ceil(remaining)}s…</span>
            </div>
          </div>
        )}

        {step === "running" && scn && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Zap size={22} className="animate-pulse text-warm" />
            <p className="text-[13px] text-mid">Detecting → deciding → executing…</p>
          </div>
        )}

        {step === "resolved" && scn && (
          <div className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2">
              <Tag color="#34d399">RESOLVED</Tag>
              <span className="text-[14px] font-medium text-hi">{scn.title}</span>
            </div>
            <p className="text-[12.5px] leading-snug text-positive">{outcome}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep("list")}>
                Run another scenario
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        )}

        {step === "miss" && scn && (
          <div className="flex flex-col gap-3 py-6">
            <p className="text-[12.5px] leading-snug text-warm">
              No live situation matching &quot;{scn.title}&quot; right now — this module only recommends when its own real conditions are met, and re-evaluates every 30 simulated minutes. Try again in a moment, or run another scenario.
            </p>
            <div className={cn("flex gap-2")}>
              <Button size="sm" variant="outline" onClick={() => setStep("list")}>
                Back to scenarios
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
