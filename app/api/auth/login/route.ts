import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookieValue, SESSION_COOKIE } from "@/lib/auth/session";
import type { Role } from "@/lib/rbac";

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: Role;
  password_hash: string;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { username, password } = body as { username?: string; password?: string };
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return NextResponse.json({ ok: false, reason: "invalid-request" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("SELECT id, username, name, role, password_hash FROM users WHERE username = ?").get(username) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    return NextResponse.json({ ok: false, reason: "invalid-credentials" }, { status: 401 });
  }

  const cookieValue = createSessionCookieValue({ id: row.id, username: row.username, name: row.name, role: row.role });
  const res = NextResponse.json({ ok: true, user: { name: row.name, role: row.role } });
  res.cookies.set(SESSION_COOKIE, cookieValue, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  return res;
}
