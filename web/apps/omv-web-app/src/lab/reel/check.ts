// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's opacity check (rethink spec 8 row 7): 400ms after a cause, nothing that is shown may
// still be faded. Walks a pane and finds every element whose own computed opacity is below 1 (so
// its effective opacity, the product down from the pane, is too), or whose visibility hides it
// while it is still animating. Development only (UI-11).
//
// What counts as shown: an element with a box. Something at opacity 0 or hidden at rest, with no
// animation or transition running on it, is put away on purpose (a quick action before the pointer
// comes, a crossfade's outgoing layer) and is not shown; at 0 while an animation runs or waits to
// start, it is still on its way in, and that is a failure. Anything between 0 and 1 is a failure
// unless it, or an ancestor in the pane, is marked `data-motion-check="skip"` for a state that is
// faded on purpose (the trace's dimmed items), which each entry says in words.

export const CHECK_AFTER_MS = 400;

export interface Faded {
  /** A short description of the element, for the status line. */
  what: string;
  /** Its effective opacity, 0 to 1. */
  opacity: number;
}

function animating(el: Element): boolean {
  return (
    typeof el.getAnimations === "function" &&
    el
      .getAnimations()
      .some((a) => a.playState === "running" || a.playState === "paused")
  );
}

function describe(el: Element): string {
  const named =
    el.getAttribute("data-motion-name") ??
    el.getAttribute("aria-label") ??
    (el.textContent ?? "").replace(/\s+/gu, " ").trim();
  const words = named.length > 32 ? `${named.slice(0, 31)}…` : named;
  const kind = el.tagName.toLowerCase();
  const cls =
    typeof el.className === "string" ? el.className.split(" ")[0] : "";
  const tag = cls ? `${kind}.${cls}` : kind;
  return words ? `"${words}" (${tag})` : tag;
}

/** Every element in `root` still faded now. */
export function fadedIn(root: Element): Faded[] {
  const found: Faded[] = [];
  const walk = (el: Element, above: number) => {
    if (el.getAttribute("data-motion-check") === "skip") {
      return;
    }
    const style = getComputedStyle(el);
    if (style.display === "none") {
      return;
    }
    const own = Number.parseFloat(style.opacity);
    const opacity = Number.isNaN(own) ? 1 : own;
    const effective = above * opacity;
    const hidden =
      style.visibility === "hidden" || style.visibility === "collapse";
    const boxed = el.getClientRects().length > 0;
    if (opacity <= 0.001 || hidden) {
      // Put away at rest, or still on its way in.
      if (boxed && animating(el)) {
        found.push({ what: describe(el), opacity: hidden ? 0 : effective });
      }
      if (opacity <= 0.001) {
        return;
      }
    } else if (opacity < 0.99 && boxed) {
      found.push({ what: describe(el), opacity: effective });
    }
    for (const child of el.children) {
      walk(child, effective);
    }
  };
  for (const child of root.children) {
    walk(child, 1);
  }
  return found;
}

/** The status line's sentence for one entry's result. */
export function checkSentence(
  failures: readonly { pane: string; faded: readonly Faded[] }[],
): string {
  const parts = failures
    .filter((f) => f.faded.length > 0)
    .map(
      (f) =>
        `${f.pane}: ${f.faded
          .slice(0, 4)
          .map((x) => `${x.what} at ${String(Math.round(x.opacity * 100))} %`)
          .join(
            ", ",
          )}${f.faded.length > 4 ? ` and ${String(f.faded.length - 4)} more` : ""}`,
    );
  return parts.length === 0
    ? "Everything is fully visible 400ms after the cause."
    : `Still faded 400ms after the cause: ${parts.join("; ")}.`;
}
