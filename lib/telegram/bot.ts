import { classify } from "@/lib/intelligence/concierge";
import type { InlineKeyboardButton } from "./api";

/** Pure decision logic for the Telegram frontline bot — no network, no DB, fully unit
 * testable. scripts/telegramBot.ts and app/api/telegram/* wire this to the real Telegram API
 * and SQLite (lib/db/client.ts); this file only decides WHAT should happen for a given
 * message, the same split lib/ai/tools.ts uses for the ops assistant's tool execution. */

export interface StaffSummary {
  id: string;
  name: string;
  dept: string;
}

export interface TaskSummary {
  id: string;
  roomNumber: string;
  type: string;
  text: string;
  ageMinutes: number;
  slaMin: number;
}

export type BotAction =
  | { kind: "reply"; text: string; buttons?: InlineKeyboardButton[][] }
  | { kind: "link"; staffId: string; staffName: string; reply: string }
  | { kind: "complete_task"; requestId: string; reply: string }
  | { kind: "report_issue"; roomNumber: string; text: string; reply: string }
  | { kind: "noop" };

const WELCOME = "Welcome to Azure Bay Resort staff bot. Send `/start Your Name` to link your account (must match your name in the roster), then `/mytasks` to see what's assigned to you. Any other message is treated as an issue report — mention a room number if it's about one.";

/** Finds the staff member whose name best matches a free-text query — exact match first,
 * then "query is contained in a staff name" (handles a first-name-only /start), case
 * insensitive throughout. Never guesses across an ambiguous partial match with multiple
 * candidates — returns null and lets the caller ask for the full name instead. */
function findStaffByName(query: string, roster: StaffSummary[]): StaffSummary | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = roster.find((s) => s.name.toLowerCase() === q);
  if (exact) return exact;
  const partial = roster.filter((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
  return partial.length === 1 ? partial[0] : null;
}

/** Pulls a real room number out of free text — only ever a number that actually exists in
 * this property's roster, never a guess at a number that merely looks room-shaped (a "24 hour"
 * mention shouldn't become a report against room 24 if there's no room 24). */
export function parseRoomNumber(text: string, validRoomNumbers: string[]): string | null {
  const tokens = text.match(/\b\d{2,4}\b/g) ?? [];
  const valid = new Set(validRoomNumbers);
  return tokens.find((t) => valid.has(t)) ?? null;
}

export function handleStartCommand(nameQuery: string, roster: StaffSummary[]): BotAction {
  if (!nameQuery.trim()) return { kind: "reply", text: WELCOME };
  const staff = findStaffByName(nameQuery, roster);
  if (!staff) return { kind: "reply", text: `Couldn't find "${nameQuery}" on the current roster — check the spelling matches your name exactly, or ask your manager to confirm it.` };
  return { kind: "link", staffId: staff.id, staffName: staff.name, reply: `Linked as *${staff.name}* (${staff.dept}). Send /mytasks any time to see what's assigned to you.` };
}

export function formatTaskList(staffName: string, tasks: TaskSummary[]): BotAction {
  if (tasks.length === 0) return { kind: "reply", text: `Nothing assigned to you right now, ${staffName}. ✅` };
  const lines = [`*Your tasks, ${staffName}:*`];
  const buttons: InlineKeyboardButton[][] = [];
  for (const t of tasks) {
    const breached = t.ageMinutes > t.slaMin;
    lines.push(`${breached ? "⚠️" : "•"} Room ${t.roomNumber} — ${t.type}: ${t.text} (${t.ageMinutes}m${breached ? ", SLA breached" : ""})`);
    buttons.push([{ text: `✅ Done — ${t.roomNumber} ${t.type}`, callback_data: `done:${t.id}` }]);
  }
  return { kind: "reply", text: lines.join("\n"), buttons };
}

export function handleCallback(data: string): BotAction {
  const [action, requestId] = data.split(":");
  if (action !== "done" || !requestId) return { kind: "noop" };
  return { kind: "complete_task", requestId, reply: "Marked done — thanks!" };
}

/** Any non-command message from a linked staff member is an issue report, per the blueprint's
 * own "staff can report issues they notice, which become tickets" ask. Reuses
 * lib/intelligence/concierge.ts's classify() for the same deterministic routing a guest
 * message gets — one classifier, not two. */
export function handleFreeTextReport(text: string, staffName: string, validRoomNumbers: string[]): BotAction {
  const roomNumber = parseRoomNumber(text, validRoomNumbers);
  if (!roomNumber) {
    return { kind: "reply", text: "Got it — I couldn't find a room number in that message, so I haven't logged it as a ticket. Include a room number (e.g. \"305 tap leaking\") and I'll create one." };
  }
  const c = classify(text);
  return { kind: "report_issue", roomNumber, text, reply: `Logged as a ${c.requestType ?? "maintenance"} ticket for room ${roomNumber}, routed to ${c.dept}. Thanks, ${staffName}.` };
}

export function unlinkedReply(): BotAction {
  return { kind: "reply", text: `Not linked yet. ${WELCOME}` };
}

export { WELCOME };
