/** Minimal ambient types for node:sqlite (Node 22+, experimental) — @types/node is pinned
 * to v20 in this project (see package.json) and doesn't ship declarations for it yet.
 * Covers only what lib/db/client.ts actually uses. */
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(location: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
  export class StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }
}
