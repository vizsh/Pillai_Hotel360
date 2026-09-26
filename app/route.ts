import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/** The public marketing landing page for "/" — a fully self-contained static HTML document
 * (its own <html>/<head>/<body>, inline CSS, a CDN-loaded three.js digital-twin visualization)
 * rather than a React page, so it renders exactly as designed instead of being wrapped by this
 * app's own root layout (which would nest a second <html><body> inside this one). A Route
 * Handler bypasses the page/layout render tree entirely, which is exactly what a verbatim
 * static document needs. middleware.ts explicitly excludes this path from the auth gate, same
 * as /login itself — a marketing page has to be reachable by a signed-out visitor.
 *
 * Source file: public/landing.html (edit that file, not this one, to change the page itself).
 * Its two hero buttons are real navigation, not local-only demo affordances: "LAUNCH COMMAND
 * MATRIX" goes to this project's own /login, and "TRIGGER SIMULATION SWEEP" opens the separate
 * guest-facing companion prototype (github.com/SDP42/guestexperience, deployed at
 * guestexperience.vercel.app) in a new tab — the two projects this session set up side by side
 * so they can eventually be linked (a guest-placed order there reflecting on this admin twin). */
export async function GET() {
  const html = fs.readFileSync(path.join(process.cwd(), "public", "landing.html"), "utf-8");
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
