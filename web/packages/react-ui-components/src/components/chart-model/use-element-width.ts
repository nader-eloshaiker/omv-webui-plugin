// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";

/**
 * Follows an element's content width with a ResizeObserver; 0 until it is laid out. Reads geometry
 * only and writes nothing, so it is safe under the Content Security Policy. Returns a callback ref.
 */
export function useElementWidth<T extends HTMLElement>(): [
  React.RefCallback<T>,
  number,
] {
  const [width, setWidth] = React.useState(0);
  const ref = React.useCallback((node: T | null) => {
    if (!node) {
      return;
    }
    const apply = (w: number) => {
      const rounded = Math.round(w);
      setWidth((previous) => (previous === rounded ? previous : rounded));
    };
    apply(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        apply(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

/**
 * As `useElementWidth`, with the height too: for a drawing measured from its laid-out parts (the
 * connection map), which must measure again when a part grows taller at the same width.
 */
export function useElementSize<T extends HTMLElement>(): [
  React.RefCallback<T>,
  { width: number; height: number },
] {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const ref = React.useCallback((node: T | null) => {
    if (!node) {
      return;
    }
    const apply = (w: number, h: number) => {
      const width = Math.round(w);
      const height = Math.round(h);
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const box = node.getBoundingClientRect();
    apply(box.width, box.height);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        apply(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, size];
}

/** Sets a forwarded ref, whichever kind it is. */
export function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

/** Whether a media query matches now, following changes. False where there is no matchMedia. */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false,
  );
}
