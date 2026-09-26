import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Node's built-in scrypt, not bcrypt — this project already avoids adding a native/npm
 * dependency where node: has the equivalent (see lib/db/client.ts's node:sqlite), and scrypt
 * is a real, slow, salted KDF, not a demo-grade shortcut. Format is "salt:hash", both hex, so
 * a single TEXT column stores everything verify() needs. */

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEY_LEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
