import type { SimState } from "@/lib/sim/types";

/** Thin client for the persistence backend (app/api/snapshots, app/api/actions, backed by
 * a real SQLite database — lib/db/client.ts). This is deliberately NOT the
 * server-authoritative simulation described as "Option A" — the sim still runs client-side
 * exactly as before; this only makes state durable and decisions auditable.
 *
 * Two different failure contracts on purpose: the write helpers (saveSnapshot, logAction)
 * are fire-and-forget — a failed background save should never visibly block or break the
 * live demo, so network errors are swallowed. The read helpers (fetchLatestSnapshot,
 * fetchActionLog) throw instead — they back a page (/history) that explicitly tells the
 * user what's in the database, and silently showing "empty" on a fetch failure would be a
 * lie: the caller needs to tell loading, error, and genuinely-empty apart. */

export interface ActionLogEntry {
  id: number;
  type: string;
  module: string | null;
  summary: string;
  payload_json: string | null;
  sim_t: number;
  created_at: string;
}

export interface SnapshotSummary {
  id: number;
  seed: number;
  scenario: string;
  sim_t: number;
  created_at: string;
}

export function saveSnapshot(state: SimState) {
  if (typeof window === "undefined") return;
  fetch("/api/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed: state.seed, scenario: state.scenario, t: state.t, state }),
    keepalive: true,
  }).catch(() => {});
}

export function logAction(entry: { type: string; module?: string; summary: string; payload?: unknown; t: number }) {
  if (typeof window === "undefined") return;
  fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {});
}

export async function fetchLatestSnapshot(): Promise<{ id: number; seed: number; scenario: string; t: number; createdAt: string; state: SimState } | null> {
  const res = await fetch("/api/snapshots/latest");
  if (!res.ok) throw new Error(`snapshot fetch failed (${res.status})`);
  const data = await res.json();
  return data.snapshot ?? null;
}

export async function fetchActionLog(limit = 50): Promise<ActionLogEntry[]> {
  const res = await fetch(`/api/actions?limit=${limit}`);
  if (!res.ok) throw new Error(`action log fetch failed (${res.status})`);
  const data = await res.json();
  return data.actions ?? [];
}
