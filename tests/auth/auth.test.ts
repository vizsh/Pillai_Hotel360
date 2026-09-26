import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionCookieValue, verifySessionCookie, type SessionPayload } from "@/lib/auth/session";

// Mirrors lib/auth/session.ts's own fallback secret/signing exactly, so this test can build a
// cookie with an arbitrary (in this case, already-expired) payload and a genuinely valid
// signature — the only way to test "expiry is checked" without exporting the private signer.
const TEST_SECRET = "smart-resort-360-demo-secret-do-not-use-in-production";
function signTestPayload(payload: SessionPayload): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", TEST_SECRET).update(json).digest("base64url");
  return `${json}.${sig}`;
}

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password against its own hash", () => {
    const hash = hashPassword("resort360");
    expect(verifyPassword("resort360", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("resort360");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt), yet both verify", () => {
    const a = hashPassword("resort360");
    const b = hashPassword("resort360");
    expect(a).not.toBe(b);
    expect(verifyPassword("resort360", a)).toBe(true);
    expect(verifyPassword("resort360", b)).toBe(true);
  });

  it("rejects malformed stored hashes rather than throwing", () => {
    expect(verifyPassword("resort360", "not-a-real-hash")).toBe(false);
    expect(verifyPassword("resort360", "")).toBe(false);
  });
});

describe("createSessionCookieValue / verifySessionCookie", () => {
  const user = { id: 1, username: "gm", name: "Ananya Reddy", role: "gm" as const };

  it("round-trips a valid session", () => {
    const cookie = createSessionCookieValue(user);
    const session = verifySessionCookie(cookie);
    expect(session).not.toBeNull();
    expect(session!.role).toBe("gm");
    expect(session!.name).toBe("Ananya Reddy");
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const cookie = createSessionCookieValue(user);
    const [json, sig] = cookie.split(".");
    const tamperedJson = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(json, "base64url").toString()), role: "gm-elevated" })).toString("base64url");
    expect(verifySessionCookie(`${tamperedJson}.${sig}`)).toBeNull();
  });

  it("rejects an expired session even with a genuinely valid signature", () => {
    const expiredPayload: SessionPayload = { userId: 1, username: "gm", name: "Ananya Reddy", role: "gm", exp: Date.now() - 1000 };
    expect(verifySessionCookie(signTestPayload(expiredPayload))).toBeNull();
  });

  it("rejects a missing or malformed cookie", () => {
    expect(verifySessionCookie(undefined)).toBeNull();
    expect(verifySessionCookie("garbage")).toBeNull();
    expect(verifySessionCookie("a.b.c")).toBeNull();
  });
});
