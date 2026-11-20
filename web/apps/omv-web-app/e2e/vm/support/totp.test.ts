// SPDX-License-Identifier: GPL-3.0-or-later
// The VM test's code generator against the RFC 6238 appendix B vectors for SHA-1 (the 8-digit
// values cut to the 6 digits the TOTP plugin uses), so a wrong code is never blamed on the server.
import { describe, expect, it } from "vitest";
import { base32Decode, totp } from "./totp.ts";

// "12345678901234567890" in ASCII, the RFC's SHA-1 key, in base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it.each([
    { name: "T = 59", seconds: 59, expected: "287082" },
    { name: "T = 1111111109", seconds: 1111111109, expected: "081804" },
    { name: "T = 1111111111", seconds: 1111111111, expected: "050471" },
    { name: "T = 1234567890", seconds: 1234567890, expected: "005924" },
    { name: "T = 2000000000", seconds: 2000000000, expected: "279037" },
    { name: "T = 20000000000", seconds: 20000000000, expected: "353130" },
  ])("matches the RFC vector at $name", ({ seconds, expected }) => {
    expect(totp(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it("ignores case, padding and spaces in the secret", () => {
    expect(totp("gezd gnbv gy3t qojq gezd gnbv gy3t qojq====", 59_000)).toBe(
      "287082",
    );
  });
});

describe("base32Decode", () => {
  it.each([
    { name: "a digit outside the alphabet", input: "GEZ1" },
    { name: "punctuation", input: "GEZD-GNBV" },
    { name: "an empty secret", input: "" },
    { name: "padding only", input: "====" },
  ])("rejects $name", ({ input }) => {
    expect(() => base32Decode(input)).toThrow();
  });

  it("decodes the RFC key", () => {
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe(
      "12345678901234567890",
    );
  });
});
