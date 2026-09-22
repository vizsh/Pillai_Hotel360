import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export async function POST(req: Request) {
  const body = await req.json();
  const { type, module, summary, payload, t } = body ?? {};
  if (typeof type !== "string" || typeof summary !== "string" || typeof t !== "number") {
    return NextResponse.json({ error: "expected { type, summary, t }" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("INSERT INTO action_log (type, module, summary, payload_json, sim_t) VALUES (?, ?, ?, ?, ?)").run(
    type,
    module ?? null,
    summary,
    payload ? JSON.stringify(payload) : null,
    t,
  );
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const db = getDb();
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
  const rows = db.prepare("SELECT id, type, module, summary, payload_json, sim_t, created_at FROM action_log ORDER BY id DESC LIMIT ?").all(limit);
  return NextResponse.json({ actions: rows });
}
