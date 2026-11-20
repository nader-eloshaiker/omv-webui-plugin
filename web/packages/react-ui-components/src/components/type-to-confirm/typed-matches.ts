// SPDX-License-Identifier: GPL-3.0-or-later
/** Whether what was typed matches the name: exact, case-sensitive, surrounding spaces ignored. */
export function typedMatches(value: string, confirmText: string) {
  return value.trim() === confirmText;
}
