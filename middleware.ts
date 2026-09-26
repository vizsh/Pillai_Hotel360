import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/auth/session";

/** Runs in the Node.js runtime, not the default Edge one — verifySessionCookie's HMAC check
 * (node:crypto) isn't guaranteed available on Edge. This gates page routes only: which pages
 * a browser can even load. It does not gate the API routes those pages call (see README's
 * Auth section for exactly what that does and doesn't mean for this client-authoritative
 * simulation, where the live data already lives in the requesting browser's own memory
 * regardless of role). */
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api|_next|login|favicon.ico|.*\\..*).*)"],
};

export function middleware(req: NextRequest) {
  const session = verifySessionCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
