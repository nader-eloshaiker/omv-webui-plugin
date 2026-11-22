// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  BIDI_PLACEHOLDER,
  inertBidi,
  isolate,
  isolateName,
} from "./isolate.ts";

const P = BIDI_PLACEHOLDER;

describe("inertBidi", () => {
  it.each([
    ["Photos", "Photos"],
    ["תמונות", "תמונות"],
    ["", ""],
    ["‮evil.exe", `${P}evil.exe`],
    ["a‪b‫c‬d‭e", `a${P}b${P}c${P}d${P}e`],
    ["⁦x⁧y⁨z⁩", `${P}x${P}y${P}z${P}`],
    ["exe‏.‏evil‎", `exe${P}.${P}evil${P}`],
    ["؜عربي", `${P}عربي`],
    // Other invisible characters are not direction controls and stay.
    ["zero​width", "zero​width"],
  ])("shows %j as %j", (text, shown) => {
    expect(inertBidi(text)).toBe(shown);
  });

  it("keeps the length, so nothing hides by vanishing", () => {
    const text = "‮⁦a‏";
    expect(inertBidi(text)).toHaveLength(text.length);
  });
});

describe("isolateName", () => {
  it("isolates the shown text, and its own isolates are the only controls left", () => {
    expect(isolateName("‮evil")).toBe(isolate(`${P}evil`));
    expect(isolateName("⁦x⁩")).toBe(isolate(`${P}x${P}`));
  });
});
