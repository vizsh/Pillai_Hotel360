import type { SimState } from "@/lib/sim/types";

/** Thin client for the persistence backend (app/api/snapshots, app/api/actions, backed by
 * a real SQLite database — lib/db/client.ts). Every call here is fire-and-forget from the
 * UI's perspective: a failed save should never block or visibly break the live demo, so
 * network errors are swallowed rather than thrown. This is deliberately NOT the
 * server-authoritative simulation described as "Option A" — the sim still runs client-side
 * exactly as before; this only makes state durable and decisions auditable. */

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
  try {
    const res = await fetch("/api/snapshots/latest");
    if (!res.ok) return null;
    const data = await res.json();
    return data.snapshot ?? null;
  } catch {
    return null;
  }
}

export async function fetchActionLog(limit = 50): Promise<ActionLogEntry[]> {
  try {
    const res = await fetch(`/api/actions?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.actions ?? [];
  } catch {
    return [];
  }
}
