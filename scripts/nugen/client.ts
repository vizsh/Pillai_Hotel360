import fs from "node:fs";
import path from "node:path";

/** Minimal Nugen REST client used by the alignment scripts (docs: https://docs.nugen.in). */
export const BASE = process.env.NUGEN_BASE_URL ?? "https://api.nugen.in";
export const API_KEY = process.env.NUGEN_API_KEY ?? "";

export function requireKey(): void {
  if (!API_KEY) {
    console.error("NUGEN_API_KEY is not set. Put it in .env.local (gitignored) and run via the npm scripts, which load it.");
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(method: string, route: string, body?: unknown, form?: FormData): Promise<T> {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function poll<T>(label: string, fn: () => Promise<T>, done: (v: T) => boolean, failed: (v: T) => string | null, everyMs = 15000, maxMs = 3 * 60 * 60 * 1000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    const bad = failed(v);
    if (bad) throw new Error(`${label} failed: ${bad}`);
    if (done(v)) return v;
    if (Date.now() - t0 > maxMs) throw new Error(`${label} timed out`);
    process.stdout.write(`  ${label}: ${JSON.stringify((v as { status?: unknown } | null)?.status ?? v)} (${Math.round((Date.now() - t0) / 1000)}s)\r`);
    await sleep(everyMs);
  }
}

/** Progress is kept in nugen/state.json so a long alignment can be resumed after any interruption. */
const STATE_FILE = path.join(process.cwd(), "nugen", "state.json");
export type State = { documentIds?: string[]; benchmarkId?: string; alignmentId?: string; modelId?: string; baseModelId?: string };
export const loadState = (): State => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {});
export function saveState(s: State): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

/** Writes or replaces KEY=value in .env.local without touching other lines. */
export function setEnv(key: string, value: string): void {
  const file = path.join(process.cwd(), ".env.local");
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(file, lines.filter((l, n) => l !== "" || n < lines.length - 1).join("\n") + "\n");
}
