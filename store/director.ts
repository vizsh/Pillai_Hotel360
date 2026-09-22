import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { getModel } from "@/lib/architecture/model";
import { injectScenario } from "@/lib/sim/actions";
import { logAction } from "@/lib/api/backend";
import { useSim } from "./sim";
import { useTwin } from "./twin";
import { useTrace } from "./trace";

export type DirectorStage = "idle" | "injected" | "tracing" | "diagnosed" | "awaiting-accept" | "executing" | "resolved";

interface DirectorState {
  stage: DirectorStage;
  assetId: string | null;
  narration: string;
  spotlightRecId: string | null;
  runScenario: (assetId: string) => void;
  reset: () => void;
}

let unsubs: (() => void)[] = [];
function clearWatchers() {
  unsubs.forEach((u) => u());
  unsubs = [];
}

const RESOLVED_LINGER_MS = 6000;

export const useDirector = create<DirectorState>()(subscribeWithSelector((set, get) => ({
  stage: "idle",
  assetId: null,
  narration: "",
  spotlightRecId: null,

  runScenario: (assetId) => {
    clearWatchers();
    const model = getModel();
    const asset = model.assetById.get(assetId);
    if (!asset) return;

    let t = 0;
    useSim.getState().mutate((s) => {
      t = s.t;
      injectScenario(s, model, assetId);
    });
    logAction({ type: "scenario.injected", module: "maintenance", summary: `Demo fault injected — ${asset.name}`, payload: { assetId }, t });
    set({ stage: "injected", assetId, narration: `Fault injected — ${asset.name} offline`, spotlightRecId: null });
    useTwin.getState().select({ kind: "asset", id: assetId });

    // Fault-trace beam picks up the new failure alert on its own (FaultTrace.tsx auto-investigate);
    // ride its active/inactive transitions to report "diagnosing" -> "root cause confirmed".
    // useTrace isn't built with subscribeWithSelector, so diff `active` manually.
    let prevActive = useTrace.getState().active;
    unsubs.push(
      useTrace.subscribe((s) => {
        if (s.active === prevActive) return;
        prevActive = s.active;
        const stage = get().stage;
        if (s.active && stage === "injected") {
          set({ stage: "tracing", narration: "Diagnosing — tracing signal to root cause…" });
        } else if (!s.active && stage === "tracing") {
          set({ stage: "diagnosed", narration: "Root cause confirmed." });
        }
      }),
    );

    // Watch for the relocation recommendation this asset's failure produces. refreshRecommendations()
    // inside injectScenario already forced one pass, so this usually resolves within a frame or two.
    unsubs.push(
      useSim.subscribe(
        (s) => s.version,
        () => {
          const stage = get().stage;
          if (stage !== "injected" && stage !== "tracing" && stage !== "diagnosed") return;
          const rec = Object.values(useSim.getState().state.recommendations).find(
            (r) => r.module === "relocation" && r.targetId === assetId && r.status === "pending",
          );
          if (rec) {
            // Stage must flip *before* touching useSim: setPaused() bumps useSim's version,
            // which re-invokes this same subscriber synchronously and re-entrantly (zustand
            // calls subscribers inside set()). Updating `stage` first makes the stage guard
            // above bail out on that re-entrant call instead of recursing forever.
            set({ stage: "awaiting-accept", narration: `${rec.title} — ready for you to accept.`, spotlightRecId: rec.id });
            // Freeze sim time here: the same emergency work order that gets the relocation
            // recommendation dispatched also auto-repairs the asset in the background, which
            // would otherwise prune this recommendation as stale before a presenter can click
            // Accept — especially at higher sim speeds. Pausing removes the race entirely.
            if (!useSim.getState().state.paused) useSim.getState().setPaused(true);
          }
        },
      ),
    );

    // Once the spotlighted recommendation is accepted (executed) or dismissed, resume the sim,
    // report the consequence, and let the caption linger briefly before returning to idle.
    unsubs.push(
      useSim.subscribe(
        (s) => s.version,
        () => {
          const id = get().spotlightRecId;
          if (!id || get().stage !== "awaiting-accept") return;
          const rec = useSim.getState().state.recommendations[id];
          if (rec?.status === "executed") {
            set({ stage: "resolved", narration: `${rec.action} — cooling restored.` });
            if (useSim.getState().state.paused) useSim.getState().setPaused(false);
            setTimeout(() => {
              if (get().stage === "resolved") get().reset();
            }, RESOLVED_LINGER_MS);
          } else if (!rec || rec.status === "dismissed") {
            set({ stage: "resolved", narration: "Scenario dismissed — no action taken." });
            if (useSim.getState().state.paused) useSim.getState().setPaused(false);
            setTimeout(() => {
              if (get().stage === "resolved") get().reset();
            }, RESOLVED_LINGER_MS);
          }
        },
      ),
    );
  },

  reset: () => {
    clearWatchers();
    set({ stage: "idle", assetId: null, narration: "", spotlightRecId: null });
    if (useSim.getState().state.paused) useSim.getState().setPaused(false);
  },
})));

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __director: typeof useDirector }).__director = useDirector;
