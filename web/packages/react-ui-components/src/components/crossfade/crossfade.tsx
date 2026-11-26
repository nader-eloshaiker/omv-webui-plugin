// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { useReducedMotion } from "../motion/reduced-motion";

interface Layer {
  key: string;
  node: React.ReactNode;
}

interface Layers extends Layer {
  out: Layer[];
  changed: boolean;
}

type CrossfadeProps = Omit<React.ComponentProps<"span">, "children"> & {
  /**
   * What is shown, as a key: when it changes the content is a different thing and crossfades; while
   * it stays, new children replace the old in place (a figure that updates is not a new thing).
   */
  contentKey: string;
  children: React.ReactNode;
  /**
   * The reduced form (rethink 7.1 rule 5). `crossfade`, the default, keeps the short fade, because a
   * fade is not travel; `cut` swaps at once, for a change whose words already say it.
   */
  reduced?: "crossfade" | "cut";
};

// Both layers share one grid cell, so the box takes the larger of the two and nothing below moves.
// The fades are the shared `fade-in` keyframes on `--duration-fast`; the leaving layer runs it in
// reverse, so it needs no keyframes of its own.
const layerClass = cva("min-w-0 [grid-area:1/1]", {
  variants: {
    phase: {
      steady: "",
      in: "animate-[fade-in_var(--duration-fast)_var(--ease-standard)_both]",
      out: "pointer-events-none animate-[fade-in_var(--duration-fast)_var(--ease-standard)_reverse_both]",
    },
  },
  defaultVariants: { phase: "steady" },
});

/**
 * Two renderings in one place (foundation 7.2): when `contentKey` changes, the new one fades in over
 * `--duration-fast` over the old one, which fades out beneath it and then goes. The old layer is
 * hidden from assistive technology and from the pointer while it leaves. Nothing happens on the first
 * render: content is there when the page is (style guide 10). Under reduced motion it keeps the fade,
 * or swaps at once with `reduced="cut"`.
 *
 * The entering and leaving layers carry `data-crossfade="in"` and `"out"`, for a caller that adds a
 * motion of its own to what arrives.
 */
function Crossfade({
  contentKey,
  children,
  reduced = "crossfade",
  className,
  ...props
}: CrossfadeProps) {
  const isReduced = useReducedMotion();
  const cut = isReduced && reduced === "cut";
  const [layers, setLayers] = React.useState<Layers>(() => ({
    key: contentKey,
    node: children,
    out: [],
    changed: false,
  }));
  let shown = layers;
  // Adjusting state while rendering (react.dev, "storing information from previous renders"): the
  // old layer is known in the same render that replaces it, so nothing jumps and back.
  if (layers.key !== contentKey) {
    shown = {
      key: contentKey,
      node: children,
      out: cut
        ? []
        : [
            ...layers.out.filter((l) => l.key !== contentKey),
            { key: layers.key, node: layers.node },
          ],
      changed: !cut,
    };
    setLayers(shown);
  } else if (layers.node !== children) {
    shown = { ...layers, node: children };
    setLayers(shown);
  }
  return (
    <span
      data-slot="crossfade"
      className={cn("inline-grid align-top", className)}
      {...props}
    >
      {shown.out.map((layer) => (
        <span
          key={layer.key}
          data-crossfade="out"
          aria-hidden="true"
          inert
          className={layerClass({ phase: "out" })}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setLayers((s) => ({
                ...s,
                out: s.out.filter((l) => l.key !== layer.key),
              }));
            }
          }}
        >
          {layer.node}
        </span>
      ))}
      <span
        key={shown.key}
        data-crossfade={shown.changed ? "in" : undefined}
        className={layerClass({ phase: shown.changed ? "in" : "steady" })}
      >
        {shown.node}
      </span>
    </span>
  );
}

export { Crossfade };
export type { CrossfadeProps };
