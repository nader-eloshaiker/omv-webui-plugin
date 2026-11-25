// SPDX-License-Identifier: GPL-3.0-or-later
// A part of the page where motion is reduced whatever the preference says (the motion reel's Reduced
// pane). It sets data-motion="reduced" on its wrapper and the reduced duration tokens on it through
// the CSSOM, so every transition and keyframe inside that reads the tokens lands at once (custom
// properties cascade), and tells useReducedMotion below it. Nothing is written into markup (UI-1).
// Written for the library (spec 8 row 7).
import type { ReactNode } from "react";
import { use, useLayoutEffect, useRef } from "react";
import { MotionScopeContext, REDUCED_TOKENS } from "./useReducedMotion.ts";

/** Without `reduced` it renders its wrapper and passes the enclosing state through. */
export function MotionScope({
  reduced = false,
  className,
  children,
}: {
  reduced?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inherited = use(MotionScopeContext);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    for (const [name, value] of Object.entries(REDUCED_TOKENS)) {
      if (reduced) {
        element.style.setProperty(name, value);
      } else {
        element.style.removeProperty(name);
      }
    }
  }, [reduced]);
  return (
    <MotionScopeContext value={reduced || inherited}>
      <div
        ref={ref}
        className={className}
        data-motion={reduced ? "reduced" : undefined}
      >
        {children}
      </div>
    </MotionScopeContext>
  );
}
