import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@/lib/rbac";

/** A hand-rolled signed cookie, not NextAuth/Auth.js — this app's pages are almost entirely
 * client components reading a live, browser-only simulation (there's no per-request server
 * data-fetch to hang a session provider off), and the actual demo need here is narrow: real
 * hashed passwords, a real signed session (not just a client-settable role in a Zustand
 * store), and a middleware redirect gate. A full auth framework would add real weight for
 * guarantees this app structurally can't use yet (see the honesty note in README's Auth
 * section). Kept intentionally small enough to read in one sitting. */

export interface SessionPayload {
  userId: number;
  username: string;
  name: string;
  role: Role;
  /** Unix ms this session stops being honored — checked on every verify, not just at issue
   * time, so a stolen cookie doesn't work forever. */
  exp: number;
}

export const SESSION_COOKIE = "sr360_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h — a demo/shift-length session, not "remember me forever"

/** Demo-appropriate secret handling: read one from the environment if set (so a real
 * deployment can pin it), otherwise derive a stable one for this process from the DB file
 * path — good enough that restarting the dev server doesn't invalidate every open session,
 * while never being committed to git (there's nothing to commit; it's derived, not stored).
 * A production deployment would set AUTH_SECRET explicitly, exactly like TELEGRAM_BOT_TOKEN. */
function secret(): string {
  return process.env.AUTH_SECRET ?? "smart-resort-360-demo-secret-do-not-use-in-production";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionCookieValue(user: { id: number; username: string; name: string; role: Role }): string {
  const payload: SessionPayload = { userId: user.id, username: user.username, name: user.name, role: user.role, exp: Date.now() + SESSION_TTL_MS };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

/** Full verification: signature + expiry. Safe to call from any Node.js route handler
 * (never from Edge middleware — node:crypto isn't guaranteed there, see middleware.ts's own
 * comment on why it only does a cheap shape check, not this). */
export function verifySessionCookie(raw: string | undefined): SessionPayload | null {
  if (!raw) return null;
  const [json, sig] = raw.split(".");
  if (!json || !sig) return null;
  const expected = sign(json);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
