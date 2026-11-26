// SPDX-License-Identifier: GPL-3.0-or-later
// Small components the reel's stages share: a count that rolls to its new value, a step's mark whose
// check draws, a drawn check for a button, and a caption. Each takes its reduced form from
// useReducedMotion. The crossfade between two renderings is the library's `Crossfade`. Development
// only (UI-11).
import { drawPath, useDrawPath } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useMotionPreference.ts";

/**
 * A count that rolls to its new value: the new figure rises into place and the old one leaves
 * upward, over `--duration-base`. Under reduced motion it changes in place.
 */
export function RollingNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [roll, setRoll] = useState<{
    shown: number;
    previous: number | null;
    n: number;
  }>({ shown: value, previous: null, n: 0 });
  if (roll.shown !== value) {
    setRoll({
      shown: value,
      previous: reduced ? null : roll.shown,
      n: roll.n + 1,
    });
  }
  const { previous, n } = roll;
  return (
    <span className="rl-roll">
      {previous !== null ? (
        <span
          key={`out-${String(n)}`}
          className="rl-roll-out"
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setRoll((r) => ({ ...r, previous: null }));
            }
          }}
        >
          {previous}
        </span>
      ) : null}
      <span
        key={`in-${String(n)}`}
        className={n > 0 && !reduced ? "rl-roll-in" : undefined}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * A step's state as a drawing: an empty circle, or a check whose stroke draws when it turns done
 * (`--duration-base`). Decorative; the words beside it say the state.
 */
export function StepMark({ done }: { done: boolean }) {
  const checkRef = useDrawPath(done, { duration: "--duration-base" });
  return (
    <svg
      viewBox="0 0 20 20"
      className="rl-stepmark"
      data-done={done || undefined}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8.25" className="rl-stepmark-ring" />
      <path
        d="M6 10.4l2.7 2.6L14 7.6"
        className="rl-stepmark-check"
        ref={checkRef}
      />
    </svg>
  );
}

/** A small drawn check for a button that says it worked ("Saved"). */
export function DrawnCheck() {
  const pathRef = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (pathRef.current) {
      void drawPath(pathRef.current, { duration: "--duration-base" });
    }
  }, []);
  return (
    <svg viewBox="0 0 16 16" className="rl-drawn-check" aria-hidden="true">
      <path d="M3.5 8.4l3 3L12.5 5" ref={pathRef} />
    </svg>
  );
}

/** A plain stage caption under a picture, in secondary text. */
export function StageNote({ children }: { children: ReactNode }) {
  return <p className="rl-stage-note">{children}</p>;
}
