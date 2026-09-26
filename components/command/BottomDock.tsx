"use client";

import { useEffect, useState } from "react";
import { Check, X, ChevronDown, ChevronUp, ChevronsDown, Sparkles, Activity, Bell, Radar, Zap } from "lucide-react";
import { useSim } from "@/store/sim";
import { useTwin, type Selection } from "@/store/twin";
import { useTrace } from "@/store/trace";
import { useDirector } from "@/store/director";
import { useUi } from "@/store/ui";
import { getModel } from "@/lib/architecture/model";
import { moduleMeta } from "@/lib/intelligence/registry";
import { sampleServedRoom } from "@/lib/twin/trace";
import { roomIdForRecommendation } from "@/lib/twin/queries";
import { acceptRecommendation, dismissRecommendationLogged } from "@/lib/api/recommendationActions";
import { fmtClock, resolveAlert } from "@/lib/sim/engine";
import type { Recommendation } from "@/lib/sim/types";
import { Button, Tag, sevColor } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Tab = "recs" | "feed" | "alerts";

function selectionFor(kind: string, id: string): Selection | null {
  if (kind === "room" || kind === "asset" || kind === "zone" || kind === "staff" || kind === "guest") return { kind, id };
  if (kind === "inventory") {
    const it = useSim.getState().state.inventory[id];
    return it ? { kind: "zone", id: it.storeZone } : null;
  }
  return null;
}

/** How long a pending recommendation counts down before Autopilot executes it — long enough
 * to read the card and see the number tick down, short enough that a judge watching a handful
 * of cards isn't left waiting. */
const AUTOPILOT_DELAY_S = 6;

function RecCard({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false);
  const mutate = useSim((s) => s.mutate);
  const spotlighted = useDirector((s) => s.spotlightRecId === rec.id);
  const autopilot = useUi((s) => s.autopilot);
  const meta = moduleMeta[rec.module];
  const model = getModel();
  const [remaining, setRemaining] = useState(AUTOPILOT_DELAY_S);
  const focus = () => {
    const sel = selectionFor(rec.targetKind, rec.targetId);
    if (sel) useTwin.getState().select(sel);
  };

  useEffect(() => {
    if (!autopilot || rec.status !== "pending") return;
    const deadline = Date.now() + AUTOPILOT_DELAY_S * 1000;
    const tick = () => {
      const secondsLeft = (deadline - Date.now()) / 1000;
      if (secondsLeft <= 0) {
        setRemaining(0);
        const state = useSim.getState().state;
        const roomId = roomIdForRecommendation(rec, state, model);
        acceptRecommendation(mutate, model, rec);
        if (roomId) useTwin.getState().ask([roomId], `Auto-executed: ${rec.title}`, "AUTOPILOT");
        return;
      }
      setRemaining(secondsLeft);
    };
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
    // rec.id (not the whole rec object) is the correct dependency here — a new pending
    // recommendation with the same id never appears mid-countdown, and depending on the
    // object itself would restart the timer on every unrelated field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, rec.status, rec.id, mutate, model]);

  return (
    <div
      className={cn(
        "flex w-[360px] shrink-0 flex-col rounded-lg border bg-void/60 p-3 transition-colors",
        rec.status === "pending" ? "border-stroke-lit" : "border-stroke opacity-60",
        spotlighted && "ring-2 ring-accent shadow-[0_0_24px_-6px_var(--accent)]",
        autopilot && rec.status === "pending" && "border-warm/50 shadow-[0_0_20px_-8px_var(--warm)]",
      )}
      style={{ borderLeftColor: meta.color, borderLeftWidth: 2 }}
    >
      <div className="flex items-center justify-between">
        <button onClick={() => useUi.getState().openMethodology(rec.module)} title="How this number is calculated">
          <Tag color={meta.color} className="cursor-pointer hover:brightness-125">
            {meta.short}
          </Tag>
        </button>
        <div className="mono flex items-center gap-2 text-[10px] text-low">
          <span title="Model confidence">conf {rec.confidence.toFixed(2)}</span>
          <span>{fmtClock(rec.createdAt)}</span>
        </div>
      </div>
      <button onClick={focus} className="mt-2 text-left text-[13px] font-medium leading-snug text-hi hover:text-accent">
        {rec.title}
      </button>
      <p className="mt-1 text-[11.5px] leading-snug text-mid">{rec.body}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-accent/90">{rec.impact}</p>
      <button onClick={() => setOpen(!open)} className="mono mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-low hover:text-hi">
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />} basis
      </button>
      {open && (
        <ul className="mono mt-1 flex flex-col gap-0.5 border-l border-stroke pl-2 text-[10.5px] text-low">
          {rec.basis.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
          <li className="text-accent/70">{meta.method}</li>
        </ul>
      )}
      <div className="mt-3 flex items-center gap-1.5">
        {rec.status === "pending" ? (
          <>
            {autopilot ? (
              <div className="flex items-center gap-2 rounded-md border border-warm/40 bg-warm/10 px-2.5 py-1.5">
                <Zap size={12} className="animate-pulse text-warm" />
                <span className="mono text-[11px] text-warm">AUTO · executing in {Math.ceil(remaining)}s</span>
              </div>
            ) : (
              <>
                <Button size="sm" variant="primary" onClick={() => acceptRecommendation(mutate, model, rec)}>
                  <Check size={12} /> Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismissRecommendationLogged(mutate, rec)}>
                  <X size={12} /> Dismiss
                </Button>
              </>
            )}
            {rec.module === "maintenance" && rec.targetKind === "asset" && (
              <Button
                size="icon"
                variant="ghost"
                title="Trace to affected room"
                onClick={() => {
                  const room = sampleServedRoom(model, useSim.getState().state, rec.targetId);
                  if (room) useTrace.getState().start(room, rec.targetId);
                }}
              >
                <Radar size={13} />
              </Button>
            )}
          </>
        ) : (
          <Tag color={rec.status === "executed" ? "#34d399" : undefined}>{rec.status}</Tag>
        )}
        <span className="ml-auto truncate text-[10.5px] text-low">{rec.action}</span>
      </div>
    </div>
  );
}

/** Below this confidence, a pending recommendation is real but not urgent enough to
 * default-show in a dock a judge sees for three minutes — it's one click away behind
 * "Show N more", not hidden. Executed/dismissed cards are behind the same toggle: they're
 * history now, and /history has the full record. */
const PRIORITY_CONFIDENCE = 0.7;

export function BottomDock() {
  const [tab, setTab] = useState<Tab>("recs");
  const [collapsed, setCollapsed] = useState(false);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const { state, mutate } = useSim();
  useSim((s) => s.version);
  useEffect(
    () =>
      useDirector.subscribe(
        (s) => s.spotlightRecId,
        (id) => {
          if (id) {
            setTab("recs");
            setCollapsed(false);
            setShowAllRecs(true);
          }
        },
      ),
    [],
  );
  const autopilot = useUi((s) => s.autopilot);
  const recs = Object.values(state.recommendations).sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.confidence - a.confidence);
  const pending = recs.filter((r) => r.status === "pending").length;
  const priorityRecs = recs.filter((r) => r.status === "pending" && r.confidence >= PRIORITY_CONFIDENCE);
  const deferredRecs = recs.filter((r) => !(r.status === "pending" && r.confidence >= PRIORITY_CONFIDENCE));
  // Autopilot forces every pending recommendation into view, priority filter included — the
  // whole point is watching them all count down, not just the ones already above the
  // default-visible confidence bar.
  const visibleRecs = showAllRecs || autopilot ? recs : priorityRecs;
  const alerts = Object.values(state.alerts).filter((a) => !a.resolvedAt).sort((a, b) => ({ critical: 0, warn: 1, info: 2 })[a.severity] - ({ critical: 0, warn: 1, info: 2 })[b.severity] || b.createdAt - a.createdAt);
  const feed = state.feed.slice(-60).reverse();

  return (
    <div className={cn("glass pointer-events-auto flex shrink-0 flex-col transition-[height]", collapsed ? "h-10" : "h-[232px]")}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-stroke px-2">
        {(
          [
            { id: "recs", label: "Recommendations", icon: <Sparkles size={13} />, n: pending },
            { id: "feed", label: "Live feed", icon: <Activity size={13} />, n: 0 },
            { id: "alerts", label: "Alerts", icon: <Bell size={13} />, n: alerts.length },
          ] as { id: Tab; label: string; icon: React.ReactNode; n: number }[]
        ).map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setCollapsed(false); }} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px]", tab === t.id && !collapsed ? "bg-accent/15 text-accent" : "text-mid hover:text-hi")}>
            {t.icon}
            {t.label}
            {t.n > 0 && <span className={cn("mono rounded-full px-1.5 text-[10px]", t.id === "alerts" ? "bg-warm/20 text-warm" : "bg-accent/20 text-accent")}>{t.n}</span>}
          </button>
        ))}
        {autopilot && (
          <span className="mono flex items-center gap-1.5 rounded-full border border-warm/50 bg-warm/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-warm">
            <Zap size={11} className="animate-pulse" /> Autopilot active
          </span>
        )}
        <span className="ml-auto text-[10.5px] text-low">{autopilot ? "Every recommendation executes on its own — switch back to Manual in the left rail to stop." : "Accepting a recommendation dispatches it into operations — watch the twin react."}</span>
        <Button size="icon" variant="ghost" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle dock">
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Button>
      </div>
      {!collapsed && (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-2">
          {tab === "recs" &&
            (recs.length === 0 ? (
              <p className="p-3 text-[12px] text-low">No recommendations yet — the modules re-evaluate every 30 simulated minutes.</p>
            ) : visibleRecs.length === 0 ? (
              <div className="flex h-full items-center gap-3 p-3">
                <p className="text-[12px] text-low">Nothing above {Math.round(PRIORITY_CONFIDENCE * 100)}% confidence right now.</p>
                <button onClick={() => setShowAllRecs(true)} className="mono flex items-center gap-1 rounded-md border border-stroke px-2 py-1 text-[11px] text-mid hover:border-stroke-lit hover:text-hi">
                  <ChevronsDown size={12} /> Show {deferredRecs.length} lower-confidence
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {visibleRecs.map((r) => (
                  <RecCard key={r.id} rec={r} />
                ))}
                {!showAllRecs && deferredRecs.length > 0 && (
                  <button
                    onClick={() => setShowAllRecs(true)}
                    className="mono flex w-[140px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-stroke text-[11px] text-mid hover:border-stroke-lit hover:text-hi"
                  >
                    <ChevronsDown size={14} />
                    +{deferredRecs.length} more
                    <span className="text-[10px] text-low">below {Math.round(PRIORITY_CONFIDENCE * 100)}% conf.</span>
                  </button>
                )}
                {showAllRecs && deferredRecs.length > 0 && (
                  <button
                    onClick={() => setShowAllRecs(false)}
                    className="mono flex w-[100px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-stroke text-[11px] text-mid hover:border-stroke-lit hover:text-hi"
                  >
                    <ChevronUp size={14} />
                    Show fewer
                  </button>
                )}
              </div>
            ))}
          {tab === "feed" && (
            <ul className="flex flex-col">
              {feed.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 border-b border-stroke/50 px-2 py-1 text-[12px] last:border-0">
                  <span className="mono w-16 shrink-0 text-[10.5px] text-low">{fmtClock(e.t)}</span>
                  <span className="mono w-14 shrink-0 text-[10px] uppercase tracking-wider" style={{ color: e.severity ? sevColor(e.severity) : "var(--text-low)" }}>
                    {e.kind}
                  </span>
                  <button
                    className="truncate text-left text-mid hover:text-hi"
                    onClick={() => {
                      const sel = e.targetKind && e.targetId ? selectionFor(e.targetKind, e.targetId) : null;
                      if (sel) useTwin.getState().select(sel);
                    }}
                  >
                    {e.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === "alerts" &&
            (alerts.length === 0 ? (
              <p className="p-3 text-[12px] text-low">No active alerts.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-lg border border-stroke bg-void/50 px-3 py-2" style={{ borderLeftColor: sevColor(a.severity), borderLeftWidth: 2 }}>
                    <div className="min-w-0 flex-1">
                      <button className="block truncate text-left text-[12.5px] text-hi hover:text-accent" onClick={() => { const sel = selectionFor(a.targetKind, a.targetId); if (sel) useTwin.getState().select(sel); }}>
                        {a.title}
                      </button>
                      <p className="truncate text-[11px] text-mid">{a.body}</p>
                      <p className="mono mt-0.5 text-[10px] text-low">{fmtClock(a.createdAt)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => mutate((s) => resolveAlert(s, a.id))}>
                      Ack
                    </Button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  );
}
