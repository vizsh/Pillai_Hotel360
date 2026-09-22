import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export async function POST(req: Request) {
  const body = await req.json();
  const { seed, scenario, t, state } = body ?? {};
  if (typeof seed !== "number" || typeof scenario !== "string" || typeof t !== "number" || !state) {
    return NextResponse.json({ error: "expected { seed, scenario, t, state }" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("INSERT INTO snapshots (seed, scenario, sim_t, state_json) VALUES (?, ?, ?, ?)").run(seed, scenario, t, JSON.stringify(state));
  // Cap history so a long-running demo doesn't grow the db file unbounded — keep the
  // latest 200 snapshots, which at the default save cadence is comfortably more than any
  // single demo session needs.
  db.prepare("DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 200)").run();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT id, seed, scenario, sim_t, created_at FROM snapshots ORDER BY id DESC LIMIT 20").all();
  return NextResponse.json({ snapshots: rows });
}
