// SPDX-License-Identifier: GPL-3.0-or-later
// The width of a pane's content, followed as the window or the lab's width frame changes, so a map
// in a pane takes the layout its own width allows. Development only (UI-11).
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}
