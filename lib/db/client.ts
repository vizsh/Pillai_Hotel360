import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { hashPassword } from "@/lib/auth/password";

/** Fixed demo roster — one account per RBAC role (lib/rbac.ts), seeded once on first run.
 * Not a signup system: there's no registration flow, and these are the only accounts that
 * will ever exist, by design (see README's Auth section for exactly what that means and
 * doesn't mean). Passwords are simple on purpose — this gates a hackathon demo, not a
 * production property's PMS — but they're still real, salted, hashed and verified, not a
 * hardcoded "if password === 'admin'" shortcut. */
const DEMO_USERS = [
  { username: "gm", name: "Ananya Reddy", role: "gm", password: "resort360" },
  { username: "revenue", name: "Kabir Shah", role: "revenue-manager", password: "resort360" },
  { username: "frontoffice", name: "Meera Iyer", role: "front-office-manager", password: "resort360" },
  { username: "housekeeping", name: "Ganesh Rao", role: "executive-housekeeper", password: "resort360" },
] as const;

/** Server-only. A real SQLite database (Node's built-in node:sqlite — experimental as of
 * Node 22, but a genuine embedded SQL database, not a mock) backing periodic full-state
 * snapshots, an append-only decision audit log, and the Telegram frontline bot's link/inbox
 * tables (scripts/telegramBot.ts and app/api/telegram/inbox — the bridge between a
 * standalone bot process and the browser-only live simulation, since the bot has no direct
 * access to client-side state). Never import this from a "use client" component; only
 * Next.js route handlers and standalone Node scripts (both real server-side contexts) should
 * touch it. */

const DB_PATH = path.join(process.cwd(), "data", "resort.db");

declare global {
  var __resortDb: DatabaseSync | undefined;
}

function init(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seed INTEGER NOT NULL,
      scenario TEXT NOT NULL,
      sim_t REAL NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      module TEXT,
      summary TEXT NOT NULL,
      payload_json TEXT,
      sim_t REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots (created_at);
    CREATE INDEX IF NOT EXISTS idx_action_log_created ON action_log (created_at);
    CREATE TABLE IF NOT EXISTS telegram_links (
      chat_id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      linked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS telegram_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_inbox_unprocessed ON telegram_inbox (processed_at);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  const userCount = db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
  if (userCount.n === 0) {
    const insert = db.prepare("INSERT INTO users (username, name, role, password_hash) VALUES (?, ?, ?, ?)");
    for (const u of DEMO_USERS) insert.run(u.username, u.name, u.role, hashPassword(u.password));
  }

  return db;
}

/** Module-level singleton guarded on globalThis, not a plain module variable — Next.js
 * dev's Fast Refresh can re-evaluate this module without restarting the process, which
 * would otherwise open a second connection to the same file and eventually hit SQLITE_BUSY. */
export function getDb(): DatabaseSync {
  if (!globalThis.__resortDb) globalThis.__resortDb = init();
  return globalThis.__resortDb;
}
