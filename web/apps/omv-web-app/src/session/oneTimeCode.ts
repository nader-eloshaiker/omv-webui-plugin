// SPDX-License-Identifier: GPL-3.0-or-later

/** The six digits of a typed or pasted one-time code, or null when it is not one. */
export function codeOf(input: string): string | null {
  const digits = input.replace(/\s+/g, "");
  return /^[0-9]{6}$/.test(digits) ? digits : null;
}
