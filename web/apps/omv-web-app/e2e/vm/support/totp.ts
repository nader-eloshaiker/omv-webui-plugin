// SPDX-License-Identifier: GPL-3.0-or-later
// One-time codes for the VM test's second-factor accounts: RFC 6238 with the parameters the TOTP
// plugin uses (A10): HMAC-SHA-1, 6 digits, 30 s steps, a base32 secret. A code is typed into the
// sign-in page and never printed or written anywhere.
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** The bytes of an RFC 4648 base32 string (padding and case ignored); throws on any other letter. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const letter of clean) {
    const index = BASE32.indexOf(letter);
    if (index < 0) {
      throw new Error("The TOTP secret is not base32.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  if (bytes.length === 0) {
    throw new Error("The TOTP secret is empty.");
  }
  return Buffer.from(bytes);
}

/** The code for `secret` at `atMs` (milliseconds since the epoch). */
export function totp(secret: string, atMs: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / STEP_SECONDS)));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  // RFC 4226 dynamic truncation: the low nibble of the last byte picks four bytes.
  const offset = (mac.at(-1) ?? 0) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * A code that stays valid for at least `marginMs` more: if the current step is about to end, the
 * next step's code. The server accepts one step of drift on each side (A10), so either is accepted.
 */
export function freshTotp(secret: string, marginMs = 5_000): string {
  const now = Date.now();
  const stepMs = STEP_SECONDS * 1000;
  const left = stepMs - (now % stepMs);
  return totp(secret, left < marginMs ? now + left : now);
}
