import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/auth/session";

/** What the client hydrates store/session.ts from on load — the server-verified role, never
 * a client-trusted one. GET only; there's nothing to mutate here. */
export async function GET() {
  const jar = await cookies();
  const session = verifySessionCookie(jar.get(SESSION_COOKIE)?.value);
  const body = session ? { ok: true, user: { name: session.name, role: session.role, username: session.username } } : { ok: false, user: null };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
