// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import * as React from "react";
import { cn } from "../../utils";
import { durationToken, prefersReducedMotion } from "../motion/motion";

type LeavingItemProps = useRender.ComponentProps<"li"> & {
  /** The entry's `leaving` from `useLeavingItems`. */
  leaving: boolean;
  /** Called once when the exit has run (or at once under reduced motion): pass `left(key)`. */
  onLeft: () => void;
};

/**
 * A list item that can leave (foundation 7.2): while `leaving` it fades and gives up its height on
 * the exit curve (`animate-leave`, 240ms), so the items after it close up instead of jumping, and it
 * is `inert`, so nothing in it can be focused or read. An `li` by default; pass `render` for another
 * element. Put the item's content in it as its only child. In a single-column list with a gap, set
 * `[--leave-gap:var(--spacing-gutter)]` (the list's gap) on the list so the gap closes too; in a
 * grid of several columns the following items move up into place when it has gone.
 *
 * If the leaving item held focus, the page moves focus on (to its heading, as when a button goes).
 *
 * ```tsx
 * const { entries, left } = useLeavingItems(rows, (row) => row.id);
 * <ul>{entries.map((e) => (
 *   <LeavingItem key={e.key} leaving={e.leaving} onLeft={() => left(e.key)}>
 *     <Card …/>
 *   </LeavingItem>
 * ))}</ul>
 * ```
 */
function LeavingItem({
  leaving,
  onLeft,
  render,
  className,
  onAnimationEnd,
  ...props
}: LeavingItemProps) {
  const onLeftRef = React.useRef(onLeft);
  React.useEffect(() => {
    onLeftRef.current = onLeft;
  });
  React.useEffect(() => {
    if (!leaving) {
      return;
    }
    if (prefersReducedMotion()) {
      onLeftRef.current();
      return;
    }
    // The net for an exit whose animationend never comes (a hidden tab, a list out of the layout).
    const timer = window.setTimeout(
      () => {
        onLeftRef.current();
      },
      durationToken("--duration-base", 240) + 120,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [leaving]);
  return useRender({
    render,
    defaultTagName: "li",
    props: {
      ...props,
      "data-slot": "leaving-item",
      "data-leaving": leaving ? "" : undefined,
      inert: leaving || undefined,
      onAnimationEnd: (event: React.AnimationEvent<HTMLLIElement>) => {
        onAnimationEnd?.(event);
        if (
          leaving &&
          event.target === event.currentTarget &&
          event.animationName === "leave"
        ) {
          onLeftRef.current();
        }
      },
      className: cn(
        "grid grid-rows-[1fr] *:min-h-0",
        "data-leaving:pointer-events-none data-leaving:animate-leave data-leaving:*:overflow-hidden",
        className,
      ),
    },
  });
}

export { LeavingItem };
export type { LeavingItemProps };
