// SPDX-License-Identifier: GPL-3.0-or-later
// The width a specimen has, so the map takes the layout it would at that width (rethink 6.8:
// wide, mid, narrow). Development only (UI-11).
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

export function useContentWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(1100);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    setWidth(node.getBoundingClientRect().width || 1100);
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}
