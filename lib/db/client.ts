import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

/** Server-only. A real SQLite database (Node's built-in node:sqlite — experimental as of
 * Node 22, but a genuine embedded SQL database, not a mock) backing two things: periodic
 * full-state snapshots (so a page refresh mid-demo doesn't lose the shift) and an
 * append-only log of every accepted/dismissed recommendation and injected scenario (a
 * real audit trail — "what decisions were made, when, on what basis"). Never import this
 * from a "use client" component; it only runs in Next.js route handlers. */

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
  `);
  return db;
}

/** Module-level singleton guarded on globalThis, not a plain module variable — Next.js
 * dev's Fast Refresh can re-evaluate this module without restarting the process, which
 * would otherwise open a second connection to the same file and eventually hit SQLITE_BUSY. */
export function getDb(): DatabaseSync {
  if (!globalThis.__resortDb) globalThis.__resortDb = init();
  return globalThis.__resortDb;
}
