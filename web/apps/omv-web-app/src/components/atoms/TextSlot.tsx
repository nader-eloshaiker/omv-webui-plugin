// SPDX-License-Identifier: GPL-3.0-or-later
// Plain words in a <Trans> slot: a translated sentence's `<client></client>` filled with text the
// caller made (already isolated where it holds server text). The slot's own children are ignored,
// as Trans gives it the sentence's empty ones. Rendered as text only (UI-2).
export function TextSlot({ value }: { value: string }) {
  return <>{value}</>;
}
