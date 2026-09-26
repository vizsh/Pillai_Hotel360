import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { describeGuestAppPayload } from "@/lib/integration/guestAppAdapter";

/** The receiving side of the guest-app bridge (hooks/useGuestAppInbox.ts drains it, mirroring
 * the exact pattern app/api/telegram/inbox already proved out for the Telegram bot). Unlike
 * that bot — a Node script running in this same repo with direct SQLite access — the guest app
 * (github.com/SDP42/guestexperience) is a fully separate, independently-deployed app with its
 * own database, so the ONLY way its guest-placed orders can ever "reach the right place" in
 * this sim is a real HTTP call in. This endpoint is that call: POST to submit a new order
 * (what guestexperience would call once it's wired up — future scope, not done on its side
 * yet, confirmed by reading its lib/requests.ts directly), GET/PATCH to drain it, matching
 * telegram/inbox's own GET+POST shape but split into three verbs since here, unlike the bot,
 * an external caller submits (POST) and the browser separately drains (GET) and acks (PATCH). */

interface InboxRow {
  id: number;
  room_number: string;
  stay_id: string | null;
  guest_name: string | null;
  req_type: string;
  payload_json: string;
  created_at: string;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, reason: "invalid body" }, { status: 400 });
  const { room, stayId, guestName, type, payload } = body as { room?: string; stayId?: string; guestName?: string; type?: string; payload?: Record<string, unknown> };
  if (!room || !/^[1-7]\d{2}$/.test(room)) return NextResponse.json({ ok: false, reason: "room must be a 3-digit room number" }, { status: 400 });
  if (!type || typeof type !== "string") return NextResponse.json({ ok: false, reason: "type is required" }, { status: 400 });

  const db = getDb();
  const text = describeGuestAppPayload(type, payload ?? {});
  db.prepare("INSERT INTO guest_app_inbox (room_number, stay_id, guest_name, req_type, payload_json) VALUES (?, ?, ?, ?, ?)").run(
    room,
    stayId ?? null,
    guestName ?? null,
    type,
    JSON.stringify({ ...payload, text }),
  );
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT id, room_number, stay_id, guest_name, req_type, payload_json, created_at FROM guest_app_inbox WHERE processed_at IS NULL ORDER BY id ASC LIMIT 50").all() as unknown as InboxRow[];
  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, room: r.room_number, stayId: r.stay_id, guestName: r.guest_name, type: r.req_type, payload: JSON.parse(r.payload_json), createdAt: r.created_at })),
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const ids = (body as { ids?: number[] } | null)?.ids;
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ ok: false, reason: "no ids" }, { status: 400 });
  const db = getDb();
  const stmt = db.prepare("UPDATE guest_app_inbox SET processed_at = datetime('now') WHERE id = ?");
  for (const id of ids) if (typeof id === "number") stmt.run(id);
  return NextResponse.json({ ok: true, processed: ids.length });
}
