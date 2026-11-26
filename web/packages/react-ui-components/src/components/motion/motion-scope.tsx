// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { ReducedMotionContext, setReducedMotionTokens } from "./reduced-motion";

interface MotionProviderProps {
  /**
   * The person's "Animations" preference is Reduced (rethink decision 8). The app reads its stored
   * preference and passes it here; the system setting is followed without it.
   */
  reduced: boolean;
  children: React.ReactNode;
}

/**
 * The "Animations" preference for every motion below it that asks `useReducedMotion`. Renders no
 * element. A provider that is not reduced passes an enclosing reduced state through.
 */
function MotionProvider({ reduced, children }: MotionProviderProps) {
  const inherited = React.use(ReducedMotionContext);
  return (
    <ReducedMotionContext value={reduced || inherited}>
      {children}
    </ReducedMotionContext>
  );
}

type MotionScopeProps = React.ComponentProps<"div"> & {
  /** Motion inside is reduced whatever the preference says. Without it the scope passes through. */
  reduced?: boolean;
};

/**
 * A part of the page where motion is reduced (a side-by-side "Reduced" pane, a preview). It sets
 * `data-motion="reduced"` on its wrapper and the reduced duration tokens on it through the CSSOM,
 * so every transition and keyframe inside that reads the tokens lands at once (custom properties
 * cascade), and tells `useReducedMotion` below it. `--duration-fast` keeps its value: what changed
 * place or shape crossfades instead (7.1 rule 5). Nothing is written into markup (UI-1).
 */
function MotionScope({
  reduced = false,
  className,
  ref,
  children,
  ...props
}: MotionScopeProps) {
  const inherited = React.use(ReducedMotionContext);
  const ownRef = React.useRef<HTMLDivElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      ownRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );
  React.useLayoutEffect(() => {
    if (ownRef.current) {
      setReducedMotionTokens(ownRef.current, reduced);
    }
  }, [reduced]);
  return (
    <ReducedMotionContext value={reduced || inherited}>
      <div
        ref={setRef}
        data-slot="motion-scope"
        data-motion={reduced ? "reduced" : undefined}
        className={cn(className)}
        {...props}
      >
        {children}
      </div>
    </ReducedMotionContext>
  );
}

export { MotionProvider, MotionScope };
export type { MotionProviderProps, MotionScopeProps };
