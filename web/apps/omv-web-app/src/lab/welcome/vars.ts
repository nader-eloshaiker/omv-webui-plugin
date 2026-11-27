// SPDX-License-Identifier: GPL-3.0-or-later
// Custom properties set on an element through the CSSOM, so geometry from data (a bay's place, a
// drive's span) reaches the stylesheet without a style attribute in markup (UI-1). Development only
// (UI-11).
import { useLayoutEffect, useRef, type Ref } from "react";

export function useVars<T extends HTMLElement>(
  vars: Record<string, string | number>,
): Ref<T> {
  const ref = useRef<T>(null);
  // After every render: setting a property to the value it has is free, and nothing is missed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, String(value));
    }
  });
  return ref;
}
