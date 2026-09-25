/** Standalone Telegram frontline-staff bot — a genuinely separate deployable, run with
 * `npm run bot` alongside (not instead of) `npm run dev`. Long-polls Telegram directly (no
 * webhook, no public URL needed) and reads/writes the SAME SQLite file the Next.js app uses
 * (lib/db/client.ts) as the bridge into the browser-only live simulation — see that file's
 * module comment for why a direct connection to the sim isn't possible from here.
 *
 * Requires TELEGRAM_BOT_TOKEN in the environment (see README's "Optional: Telegram frontline
 * bot" section for how to get one from @BotFather — free, no business verification, unlike
 * the WhatsApp Business Cloud API, which is why this project builds Telegram first). */

import { getModel } from "@/lib/architecture/model";
import { getDb } from "@/lib/db/client";
import { TelegramClient, type TelegramUpdate } from "@/lib/telegram/api";
import { formatTaskList, handleCallback, handleFreeTextReport, handleStartCommand, unlinkedReply, type StaffSummary, type TaskSummary } from "@/lib/telegram/bot";
import type { SimState } from "@/lib/sim/types";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set. See README's Telegram frontline bot section.");
  process.exit(1);
}

const client = new TelegramClient(token);
const model = getModel();
const db = getDb();

function latestSnapshot(): SimState | null {
  const row = db.prepare("SELECT state_json FROM snapshots ORDER BY id DESC LIMIT 1").get() as { state_json: string } | undefined;
  return row ? (JSON.parse(row.state_json) as SimState) : null;
}

function roster(state: SimState): StaffSummary[] {
  return Object.values(state.staff).map((s) => ({ id: s.id, name: s.name, dept: s.dept }));
}

function tasksFor(state: SimState, staffId: string): TaskSummary[] {
  return Object.values(state.requests)
    .filter((r) => r.assignedTo === staffId && r.status !== "done")
    .map((r) => ({ id: r.id, roomNumber: model.roomById.get(r.roomId)?.number ?? r.roomId, type: r.type, text: r.text, ageMinutes: Math.round(state.t - r.createdAt), slaMin: r.slaMin }));
}

function linkedStaff(chatId: number): { staffId: string; staffName: string } | null {
  const row = db.prepare("SELECT staff_id, staff_name FROM telegram_links WHERE chat_id = ?").get(String(chatId)) as { staff_id: string; staff_name: string } | undefined;
  return row ? { staffId: row.staff_id, staffName: row.staff_name } : null;
}

function enqueue(type: string, payload: unknown) {
  db.prepare("INSERT INTO telegram_inbox (type, payload_json) VALUES (?, ?)").run(type, JSON.stringify(payload));
}

async function handleUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id;
    const link = chatId ? linkedStaff(chatId) : null;
    const action = handleCallback(cq.data ?? "");
    if (action.kind === "complete_task" && link) {
      enqueue("complete_task", { requestId: action.requestId, staffName: link.staffName });
      await client.answerCallbackQuery(cq.id, "Done");
      if (chatId) await client.sendMessage(chatId, action.reply);
    } else {
      await client.answerCallbackQuery(cq.id);
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = latestSnapshot();
  if (!state) {
    await client.sendMessage(chatId, "The resort simulation hasn't published any data yet — open the app in a browser first, wait ~20s, then try again.");
    return;
  }

  if (text.startsWith("/start")) {
    const nameQuery = text.replace(/^\/start\s*/, "");
    const action = handleStartCommand(nameQuery, roster(state));
    if (action.kind === "link") {
      db.prepare("INSERT INTO telegram_links (chat_id, staff_id, staff_name) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET staff_id = excluded.staff_id, staff_name = excluded.staff_name").run(String(chatId), action.staffId, action.staffName);
      await client.sendMessage(chatId, action.reply);
    } else if (action.kind === "reply") {
      await client.sendMessage(chatId, action.text);
    }
    return;
  }

  const link = linkedStaff(chatId);
  if (text === "/mytasks") {
    if (!link) {
      const action = unlinkedReply();
      if (action.kind === "reply") await client.sendMessage(chatId, action.text);
      return;
    }
    const action = formatTaskList(link.staffName, tasksFor(state, link.staffId));
    if (action.kind === "reply") await client.sendMessage(chatId, action.text, action.buttons);
    return;
  }

  if (!link) {
    const action = unlinkedReply();
    if (action.kind === "reply") await client.sendMessage(chatId, action.text);
    return;
  }

  const validRoomNumbers = model.rooms.map((r) => r.number);
  const action = handleFreeTextReport(text, link.staffName, validRoomNumbers);
  if (action.kind === "report_issue") {
    enqueue("report_issue", { roomNumber: action.roomNumber, text: action.text, staffName: link.staffName });
    await client.sendMessage(chatId, action.reply);
  } else if (action.kind === "reply") {
    await client.sendMessage(chatId, action.text);
  }
}

async function main() {
  const me = await client.getMe();
  if (!me) {
    console.error("Could not reach Telegram with this token — check TELEGRAM_BOT_TOKEN is correct and this machine has internet access.");
    process.exit(1);
  }
  console.log(`Telegram bot @${me.username} running. Staff should message it and send /start <their name>.`);

  let offset = 0;
  for (;;) {
    let updates: TelegramUpdate[] = [];
    try {
      updates = await client.getUpdates(offset);
    } catch (err) {
      console.error("getUpdates failed, retrying in 5s:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        await handleUpdate(update);
      } catch (err) {
        console.error("Error handling update:", err instanceof Error ? err.message : err);
      }
    }
  }
}

main();
