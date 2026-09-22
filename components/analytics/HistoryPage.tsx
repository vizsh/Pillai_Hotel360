"use client";

import { useEffect, useState } from "react";
import { RotateCcw, RefreshCw, WifiOff } from "lucide-react";
import { useSim } from "@/store/sim";
import { moduleMeta } from "@/lib/intelligence/registry";
import { fetchActionLog, fetchLatestSnapshot, type ActionLogEntry } from "@/lib/api/backend";
import { fmtClock } from "@/lib/sim/engine";
import { AnalyticsShell, Card } from "./AnalyticsShell";
import { Button, Provenance, Tag } from "@/components/ui/primitives";
import type { ModuleId } from "@/lib/sim/types";

const typeLabel: Record<string, string> = {
  "recommendation.accepted": "Accepted",
  "recommendation.dismissed": "Dismissed",
  "scenario.injected": "Demo scenario",
};

type LogState = { status: "loading" } | { status: "error" } | { status: "ready"; entries: ActionLogEntry[] };

export function HistoryPage() {
  const restoreState = useSim((s) => s.restoreState);
  const [log, setLog] = useState<LogState>({ status: "loading" });
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const load = () => {
    setLog({ status: "loading" });
    fetchActionLog(100)
      .then((entries) => setLog({ status: "ready", entries }))
      .catch(() => setLog({ status: "error" }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchActionLog(100)
      .then((entries) => {
        if (!cancelled) setLog({ status: "ready", entries });
      })
      .catch(() => {
        if (!cancelled) setLog({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async () => {
    setRestoring(true);
    setRestoreError(false);
    try {
      const snap = await fetchLatestSnapshot();
      if (!snap) return;
      restoreState(snap.state);
      setRestoredAt(snap.createdAt);
    } catch {
      setRestoreError(true);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <AnalyticsShell
      title="History"
      subtitle="A real, append-only audit log — every accepted or dismissed recommendation and every injected demo scenario, written to a SQLite database (app/api/actions) as it happens. State itself is snapshotted every 20 seconds (app/api/snapshots), so a page refresh mid-demo doesn't lose the shift."
    >
      <Card title="Persistence" right={<Provenance />}>
        <div className="flex items-center justify-between gap-4">
          <p className="max-w-[600px] text-[12px] leading-snug text-mid">
            Restores the live simulation from the last snapshot written to the database — proves state actually survives outside this browser tab, not just in memory.
            {restoredAt && <span className="mt-1 block text-accent">Restored from snapshot saved {new Date(restoredAt).toLocaleString()}.</span>}
            {restoreError && (
              <span className="mt-1 flex items-center gap-1.5 text-warm">
                <WifiOff size={12} /> Couldn&apos;t reach the backend — check the connection and try again. The live simulation is unaffected.
              </span>
            )}
          </p>
          <Button size="sm" variant="outline" onClick={restore} disabled={restoring}>
            <RotateCcw size={13} /> {restoring ? "Restoring…" : "Restore last snapshot"}
          </Button>
        </div>
      </Card>

      <Card
        title={`Decision log${log.status === "ready" ? ` (${log.entries.length})` : ""}`}
        right={
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
        }
      >
        {log.status === "loading" ? (
          <div className="flex flex-col gap-2 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-white/[0.03]" />
            ))}
          </div>
        ) : log.status === "error" ? (
          <div className="flex items-center gap-3 p-3">
            <WifiOff size={16} className="shrink-0 text-warm" />
            <div>
              <p className="text-[12px] text-hi">Couldn&apos;t load the decision log — the backend didn&apos;t respond.</p>
              <p className="text-[11px] text-low">This only affects this page; the live simulation and its recommendations still work normally.</p>
            </div>
            <Button size="sm" variant="outline" onClick={load} className="ml-auto shrink-0">
              Retry
            </Button>
          </div>
        ) : log.entries.length === 0 ? (
          <p className="text-[12px] text-low">No decisions logged yet — accept or dismiss a recommendation, or inject a demo scenario, and it&apos;ll show up here.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="label text-left">
              <tr>
                <th className="pb-2 font-normal">Sim time</th>
                <th className="pb-2 font-normal">Module</th>
                <th className="pb-2 font-normal">Action</th>
                <th className="pb-2 font-normal">Summary</th>
                <th className="pb-2 font-normal">Logged</th>
              </tr>
            </thead>
            <tbody className="mono">
              {log.entries.map((e) => (
                <tr key={e.id} className="border-t border-stroke/60">
                  <td className="py-2 text-mid">{fmtClock(e.sim_t)}</td>
                  <td className="py-2">{e.module && moduleMeta[e.module as ModuleId] ? <Tag color={moduleMeta[e.module as ModuleId].color}>{moduleMeta[e.module as ModuleId].short}</Tag> : <span className="text-low">—</span>}</td>
                  <td className="py-2 text-hi">{typeLabel[e.type] ?? e.type}</td>
                  <td className="py-2 text-mid">{e.summary}</td>
                  <td className="py-2 text-[10.5px] text-low">{new Date(e.created_at + "Z").toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AnalyticsShell>
  );
}
