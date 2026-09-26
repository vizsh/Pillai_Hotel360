"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap, Play, ChevronLeft } from "lucide-react";
import { useUi } from "@/store/ui";
import { useSim } from "@/store/sim";
import { useTwin } from "@/store/twin";
import { getModel } from "@/lib/architecture/model";
import { moduleMeta } from "@/lib/intelligence/registry";
import { handleGuestMessage } from "@/lib/intelligence/concierge";
import { applyGuestAppOrder, completeRequestExternally } from "@/lib/sim/actions";
import { acceptRecommendation } from "@/lib/api/recommendationActions";
import { fmtClock, tick } from "@/lib/sim/engine";
import {
  SCENARIOS,
  triggerSoftMaintenanceIssue,
  triggerAssetFailure,
  triggerPersonalizationVip,
  tickForwardStep,
  pickOccupiedRoom,
  isPhysicalScenario,
  type ScenarioDef,
} from "@/lib/sim/scenarioCatalog";
import type { Recommendation, SimState } from "@/lib/sim/types";
import { Button, Tag } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const BRIEF_SECONDS = 4;
const TICK_FORWARD_CAP = 12; // 12 x 30min = 6 simulated hours before an honest miss
const ENROUTE_STEP_MIN = 4; // sim-minutes advanced per animation frame while a staff member walks
const ENROUTE_FRAME_MS = 260;
const ENROUTE_MAX_FRAMES = 90; // ~5.5 simulated hours of safety cap before force-completing

type Step = "list" | "brief" | "run" | "resolved" | "miss";
type Sel = { kind: "room" | "asset"; id: string };

const dept = (d: string) => d[0].toUpperCase() + d.slice(1);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [outcome, setOutcome] = useState("");
  const runIdRef = useRef(0);
  const briefTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const model = getModel();

  const append = (line: string) => setLog((prev) => [...prev, line]);

  const close = () => {
    useUi.getState().setScenarioPanelOpen(false);
    setStep("list");
    setScn(null);
    if (briefTimerRef.current) clearInterval(briefTimerRef.current);
  };

  const pick = (s: ScenarioDef) => {
    setScn(s);
    setStep("brief");
    setRemaining(BRIEF_SECONDS);
  };

  const focus = (sel: Sel, caption: string) => {
    useTwin.getState().select(sel);
    const roomId = sel.kind === "room" ? sel.id : (model.rooms.find((r) => model.assetById.get(sel.id)?.servesFloors.includes(r.floor))?.id ?? model.rooms[0].id);
    useTwin.getState().ask([roomId], caption, "SCENARIO");
  };

  const run = async (s: ScenarioDef) => {
    if (briefTimerRef.current) clearInterval(briefTimerRef.current);
    const myRun = ++runIdRef.current;
    const stale = () => myRun !== runIdRef.current;
    setLog([]);
    setProgress(null);
    setStep("run");
    const mutate = useSim.getState().mutate;

    if (isPhysicalScenario(s.kind)) {
      // --- Physical scenarios: a real ServiceRequest gets created, a real staff member gets
      // dispatched, and the walk + service time is driven by the actual tick() loop — not a
      // fake progress bar. Sim is paused for the duration so wall-clock demo pacing is
      // decoupled from whatever global speed the presenter has set elsewhere.
      let target: { kind: "room"; id: string; number: string } | null = null;
      let incomingText = "";
      if (s.kind === "guest-message") {
        const room = pickOccupiedRoom(useSim.getState().state, model);
        if (room) {
          target = { kind: "room", id: room.id, number: room.number };
          incomingText = '"The AC in my room isn\'t working and it\'s really hot, can someone come now please"';
        }
      } else if (s.kind === "guest-app-order") {
        const room = pickOccupiedRoom(useSim.getState().state, model);
        if (room) {
          target = { kind: "room", id: room.id, number: room.number };
          incomingText = "room_service: 2x Club Sandwich, 1x Coffee (via guestexperience app)";
        }
      }
      // asset-failure has no room to peek at in advance — the affected rooms only become known
      // once the fault is injected and relocation/guest-impact recompute against it.

      append(s.kind === "asset-failure" ? "Reading live telemetry across all monitored plant…" : `Incoming signal: ${incomingText}`);
      await sleep(1100);
      if (stale()) return;

      let assetId: string | null = null;
      let requestId: string | undefined;
      let guestName = "Guest";
      let intent = "";

      if (s.kind === "asset-failure") {
        mutate((st) => {
          assetId = triggerAssetFailure(st, model);
        });
        if (!assetId) {
          setStep("miss");
          return;
        }
        const asset = model.assetById.get(assetId)!;
        const st = useSim.getState().state.assets[assetId];
        append(`${asset.name}: temperature ${st.temp.toFixed(0)}° (baseline ${st.tempBase.toFixed(0)}°), vibration ${st.vibration.toFixed(0)} (baseline ${st.vibBase.toFixed(0)}) → status FAILED`);
        await sleep(1000);
        if (stale()) return;
        append(`Failure probability 100% (7-day model) — emergency repair authorized without waiting for human sign-off`);
        const req = Object.values(useSim.getState().state.requests).find((r) => r.roomId === assetId && r.text === "Emergency repair");
        requestId = req?.id;
        target = { kind: "room", id: model.rooms.find((r) => model.assetById.get(assetId!)?.servesFloors.includes(r.floor))?.id ?? model.rooms[0].id, number: asset.name };
      } else if (target) {
        mutate((st) => {
          if (s.kind === "guest-message") {
            const g = st.rooms[target!.id]?.guestId ? st.guests[st.rooms[target!.id].guestId!] : null;
            guestName = g?.name ?? "Guest";
            const r = handleGuestMessage(st, model, target!.id, "The AC in my room isn't working and it's really hot, can someone come now please");
            requestId = r.requestId;
            intent = r.classified.intent;
          } else {
            const g = st.rooms[target!.id]?.guestId ? st.guests[st.rooms[target!.id].guestId!] : null;
            guestName = g?.name ?? "Guest";
            const req = applyGuestAppOrder(st, model, target!.id, guestName, "room_service", "Room service (guest app): 2x Club Sandwich, 1x Coffee");
            requestId = req.id;
          }
        });
        if (s.kind === "guest-message") {
          append(requestId ? `Keyword classifier: intent="${intent}" → routes to ${useSim.getState().state.requests[requestId]?.type}, urgency HIGH ("now")` : `Keyword classifier: intent="smalltalk" — no ticket needed`);
        } else {
          append(`guestexperience type "room_service" → internal type "fnb" (lib/integration/guestAppAdapter.ts)`);
        }
        await sleep(1000);
        if (stale()) return;
      } else {
        setStep("miss");
        return;
      }

      if (!requestId) {
        setOutcome(s.kind === "guest-message" ? "Classified as low-priority — no dispatch needed this pass." : "No occupied room was available to place the order from.");
        setStep("resolved");
        return;
      }

      const req = useSim.getState().state.requests[requestId];
      const staff = req.assignedTo ? useSim.getState().state.staff[req.assignedTo] : null;
      focus(target, `AUTOMATED · ${s.title}`);

      if (!staff) {
        append(`No ${req.type} staff currently free — queued, will dispatch the moment someone is.`);
        setOutcome(`${req.text} — queued for ${req.type}.`);
        setStep("resolved");
        return;
      }

      append(`Dispatched ${staff.name} (${dept(staff.dept)}) → ${target.number} · ${staff.path.length} waypoints · SLA ${req.slaMin} min`);
      await sleep(700);
      if (stale()) return;

      const wasPaused = useSim.getState().state.paused;
      if (!wasPaused) useSim.getState().setPaused(true);
      setProgress({ pct: 0, label: `${staff.name} en route to ${target.number}…` });

      for (let i = 0; i < ENROUTE_MAX_FRAMES; i++) {
        if (stale()) return;
        const liveReq = useSim.getState().state.requests[requestId];
        if (liveReq.status === "done") break;
        mutate((st) => tick(st, model, ENROUTE_STEP_MIN));
        const s2 = useSim.getState().state;
        const liveStaff = s2.staff[req.assignedTo!];
        const liveReq2 = s2.requests[requestId];
        if (liveReq2.status === "done") break;
        if (liveStaff.status === "moving") {
          const pct = Math.round((liveStaff.pathIdx / Math.max(1, liveStaff.path.length)) * 60);
          setProgress({ pct, label: `${liveStaff.name} walking → ${target.number} (${liveStaff.pathIdx}/${liveStaff.path.length} waypoints)` });
        } else if (liveStaff.status === "working") {
          const workPct = clampPct(60 + ((s2.t - (liveReq2.createdAt ?? s2.t)) / Math.max(1, req.slaMin)) * 40);
          setProgress({ pct: workPct, label: `${liveStaff.name} on site, servicing — ETA ${fmtClock(liveStaff.workUntil)}` });
        }
        await sleep(ENROUTE_FRAME_MS);
      }
      if (stale()) return;

      let finalReq = useSim.getState().state.requests[requestId];
      if (finalReq.status !== "done") {
        mutate((st) => completeRequestExternally(st, model, requestId!, staff.name));
        finalReq = useSim.getState().state.requests[requestId];
      }
      if (!wasPaused) useSim.getState().setPaused(false);
      setProgress({ pct: 100, label: "Done" });
      append(`${staff.name} completed the job at ${fmtClock(finalReq.completedAt ?? useSim.getState().state.t)} — request marked done.`);

      if (s.kind === "asset-failure" && assetId) {
        const relocRec = Object.values(useSim.getState().state.recommendations).find((r) => r.module === "relocation" && r.targetId === assetId && r.status === "pending");
        if (relocRec) {
          await sleep(500);
          append(`${relocRec.title} — matching displaced guests against vacant-clean inventory…`);
          acceptRecommendation(mutate, model, relocRec);
          await sleep(400);
          const executed = useSim.getState().state.recommendations[relocRec.id];
          append(executed?.action ?? relocRec.action);
        }
      }

      setOutcome(s.kind === "guest-message" ? `Classified as "${intent}" and resolved by ${staff.name} — SLA ${req.slaMin} min.` : s.kind === "guest-app-order" ? `${guestName}'s order delivered by ${staff.name}.` : `Emergency repair completed by ${staff.name}${assetId ? ` on ${model.assetById.get(assetId)!.name}` : ""}.`);
      setStep("resolved");
      return;
    }

    // --- Administrative scenarios: no physical walk, but every number shown below is read
    // straight off the real recommendation object the module produced.
    if (s.kind === "asset-soft") {
      append("Scanning plant telemetry for the asset closest to its own service threshold…");
      await sleep(900);
      if (stale()) return;
      let assetId: string | null = null;
      mutate((st) => {
        assetId = triggerSoftMaintenanceIssue(st, model);
      });
      if (!assetId) {
        setStep("miss");
        return;
      }
      const asset = model.assetById.get(assetId)!;
      const st = useSim.getState().state.assets[assetId];
      append(`${asset.name}: temp ${st.temp.toFixed(0)}° (+${(((st.temp - st.tempBase) / st.tempBase) * 100).toFixed(0)}% vs baseline), vibration +${(((st.vibration - st.vibBase) / st.vibBase) * 100).toFixed(0)}% vs baseline`);
      await sleep(1000);
      if (stale()) return;
      const rec = useSim.getState().state.recommendations[`rec-maint-${assetId}`] ?? null;
      focus({ kind: "asset", id: assetId }, `AUTOMATED · ${s.title}`);
      await runRecOutcome(rec, `Weibull hazard model recomputed — failure probability now past the 35% action threshold`, mutate);
      return;
    }

    // recommendation-kind: search live, fall back to nudging the exact precondition (personalization
    // only, where it's cheap and safe), then to advancing the real sim clock in visible steps.
    append(`Scanning ${moduleMeta[s.module].label} for a live match…`);
    await sleep(800);
    if (stale()) return;

    let rec = findMatch(useSim.getState().state, s);
    if (!rec && s.id === "personalization-vip") {
      let guestId: string | null = null;
      mutate((st) => {
        guestId = triggerPersonalizationVip(st, model);
      });
      if (guestId) {
        const g = useSim.getState().state.guests[guestId];
        append(`${g.name} · ${model.roomById.get(g.roomId!)!.number}: preference profile updated (sea-view) — a matching vacant-clean room exists`);
        await sleep(800);
        if (stale()) return;
      }
      rec = findMatch(useSim.getState().state, s);
    }

    let advanced = 0;
    while (!rec && advanced < TICK_FORWARD_CAP) {
      mutate((st) => tickForwardStep(st, model, 30));
      advanced++;
      append(`No live match yet — advancing the clock to ${fmtClock(useSim.getState().state.t)} for the model to re-evaluate…`);
      await sleep(280);
      if (stale()) return;
      rec = findMatch(useSim.getState().state, s);
    }

    if (!rec) {
      setStep("miss");
      return;
    }

    append(`Match found: ${rec.title}`);
    await sleep(700);
    if (stale()) return;
    for (const b of rec.basis.slice(0, 3)) append(`· ${b}`);
    append(`Confidence ${(rec.confidence * 100).toFixed(0)}%`);
    await sleep(900);
    if (stale()) return;
    const sel: Sel = rec.targetKind === "room" || rec.targetKind === "asset" ? { kind: rec.targetKind, id: rec.targetId } : { kind: "room", id: model.rooms[0].id };
    focus(sel, `AUTOMATED · ${s.title}`);
    await runRecOutcome(rec, null, mutate);
  };

  async function runRecOutcome(rec: Recommendation | null, extraLine: string | null, mutate: (fn: (s: SimState) => void) => void) {
    if (!rec) {
      setStep("miss");
      return;
    }
    if (extraLine) {
      append(extraLine);
      await sleep(800);
    }
    append(`Applying: ${rec.action}`);
    await sleep(600);
    acceptRecommendation(mutate, model, rec);
    const executed = useSim.getState().state.recommendations[rec.id] ?? rec;
    append(executed.impact);
    setOutcome(`${executed.action} — ${executed.impact}`);
    setStep("resolved");
  }

  useEffect(() => {
    if (step !== "brief" || !scn) return;
    const deadline = Date.now() + BRIEF_SECONDS * 1000;
    briefTimerRef.current = setInterval(() => {
      const left = (deadline - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        void run(scn);
        return;
      }
      setRemaining(left);
    }, 100);
    return () => {
      if (briefTimerRef.current) clearInterval(briefTimerRef.current);
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

        {step === "run" && scn && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="animate-pulse text-warm" />
              <span className="text-[13px] font-medium text-hi">{scn.title}</span>
            </div>
            <ul className="scrollbar-thin flex max-h-[280px] flex-col gap-1.5 overflow-y-auto rounded-lg border border-stroke bg-void/40 p-3">
              {log.map((line, i) => (
                <li key={i} className="mono flex gap-2 text-[11.5px] leading-snug text-mid">
                  <span className="text-low">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
              {!log.length && <li className="text-[11.5px] text-low">Starting…</li>}
            </ul>
            {progress && (
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-warm transition-[width]" style={{ width: `${progress.pct}%` }} />
                </div>
                <span className="mono text-[10.5px] text-warm">{progress.label}</span>
              </div>
            )}
          </div>
        )}

        {step === "resolved" && scn && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag color="#34d399">RESOLVED</Tag>
              <span className="text-[14px] font-medium text-hi">{scn.title}</span>
            </div>
            <ul className="scrollbar-thin flex max-h-[220px] flex-col gap-1.5 overflow-y-auto rounded-lg border border-stroke bg-void/40 p-3">
              {log.map((line, i) => (
                <li key={i} className="mono flex gap-2 text-[11px] leading-snug text-low">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] leading-snug text-positive">{outcome}</p>
            <div className="mt-1 flex gap-2">
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
          <div className="flex flex-col gap-3 py-2">
            <ul className="scrollbar-thin flex max-h-[220px] flex-col gap-1.5 overflow-y-auto rounded-lg border border-stroke bg-void/40 p-3">
              {log.map((line, i) => (
                <li key={i} className="mono flex gap-2 text-[11px] leading-snug text-low">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] leading-snug text-warm">
              No live situation matching &quot;{scn.title}&quot; even after advancing the simulated clock — this module only recommends when its own real conditions are met. Try again in a moment, or run another scenario.
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

function clampPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}
