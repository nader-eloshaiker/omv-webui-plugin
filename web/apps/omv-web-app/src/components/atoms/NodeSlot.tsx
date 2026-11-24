// SPDX-License-Identifier: GPL-3.0-or-later
// An element or words in a <Trans> slot: a translated sentence's `<object></object>` filled with what
// the caller made (an isolated identifier, a phrase from the catalogue). The slot's own children are
// ignored, as Trans gives it the sentence's empty ones (TextSlot for plain strings).
import type { ReactNode } from "react";

export function NodeSlot({ value }: { value: ReactNode }) {
  return <>{value}</>;
}
