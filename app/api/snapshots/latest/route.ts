import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export async function GET() {
  const db = getDb();
  const row = db.prepare("SELECT id, seed, scenario, sim_t, state_json, created_at FROM snapshots ORDER BY id DESC LIMIT 1").get() as
    | { id: number; seed: number; scenario: string; sim_t: number; state_json: string; created_at: string }
    | undefined;
  if (!row) return NextResponse.json({ snapshot: null });
  return NextResponse.json({
    snapshot: { id: row.id, seed: row.seed, scenario: row.scenario, t: row.sim_t, createdAt: row.created_at, state: JSON.parse(row.state_json) },
  });
}
