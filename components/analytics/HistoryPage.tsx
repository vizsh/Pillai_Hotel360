"use client";

import { useEffect, useState } from "react";
import { RotateCcw, RefreshCw } from "lucide-react";
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

export function HistoryPage() {
  const restoreState = useSim((s) => s.restoreState);
  const [entries, setEntries] = useState<ActionLogEntry[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const load = () => {
    setEntries(null);
    fetchActionLog(100).then(setEntries);
  };

  useEffect(() => {
    let cancelled = false;
    fetchActionLog(100).then((data) => {
      if (!cancelled) setEntries(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async () => {
    setRestoring(true);
    const snap = await fetchLatestSnapshot();
    setRestoring(false);
    if (!snap) return;
    restoreState(snap.state);
    setRestoredAt(snap.createdAt);
  };

  return (
    <AnalyticsShell
      title="History"
      subtitle="A real, append-only audit log — every accepted or dismissed recommendation and every injected demo scenario, written to a SQLite database (app/api/actions) as it happens. State itself is snapshotted every 20 seconds (app/api/snapshots), so a page refresh mid-demo doesn't lose the shift."
    >
      <Card
        title="Persistence"
        right={<Provenance />}
      >
        <div className="flex items-center justify-between">
          <p className="max-w-[600px] text-[12px] leading-snug text-mid">
            Restores the live simulation from the last snapshot written to the database — proves state actually survives outside this browser tab, not just in memory.
            {restoredAt && <span className="mt-1 block text-accent">Restored from snapshot saved {new Date(restoredAt).toLocaleString()}.</span>}
          </p>
          <Button size="sm" variant="outline" onClick={restore} disabled={restoring}>
            <RotateCcw size={13} /> {restoring ? "Restoring…" : "Restore last snapshot"}
          </Button>
        </div>
      </Card>

      <Card
        title={`Decision log${entries ? ` (${entries.length})` : ""}`}
        right={
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </Button>
        }
      >
        {entries === null ? (
          <p className="text-[12px] text-low">Loading…</p>
        ) : entries.length === 0 ? (
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
              {entries.map((e) => (
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
