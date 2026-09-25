import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

/** The bridge the browser polls (hooks/useTelegramInbox.ts): scripts/telegramBot.ts writes
 * here directly via SQLite when a staff member taps "Done" or reports an issue, since the
 * bot has no way to reach the live client-side simulation any other way — only the browser
 * that's actually running the sim can apply the effect (mark a request done, create a new
 * one). GET returns unprocessed rows; POST marks them processed once applied, so a second
 * poll (or a second open tab) never double-applies the same action. */

interface InboxRow {
  id: number;
  type: string;
  payload_json: string;
  created_at: string;
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT id, type, payload_json, created_at FROM telegram_inbox WHERE processed_at IS NULL ORDER BY id ASC LIMIT 50").all() as unknown as InboxRow[];
  return NextResponse.json({ items: rows.map((r) => ({ id: r.id, type: r.type, payload: JSON.parse(r.payload_json), createdAt: r.created_at })) });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { ids } = body as { ids?: number[] };
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ ok: false, reason: "no ids" }, { status: 400 });
  const db = getDb();
  const stmt = db.prepare("UPDATE telegram_inbox SET processed_at = datetime('now') WHERE id = ?");
  for (const id of ids) if (typeof id === "number") stmt.run(id);
  return NextResponse.json({ ok: true, processed: ids.length });
}
