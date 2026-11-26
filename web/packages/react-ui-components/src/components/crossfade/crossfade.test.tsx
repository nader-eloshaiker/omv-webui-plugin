// SPDX-License-Identifier: GPL-3.0-or-later
// The crossfade: nothing moves on the first render, a new key fades in over the old one, which is
// hidden from assistive technology and goes when its fade ends, and `reduced="cut"` swaps at once
// under reduced motion.
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MotionScope } from "../motion/motion-scope";
import { Crossfade } from "./crossfade";

/** jsdom has no AnimationEvent, so React listens for the prefixed name there: send both. */
function animationEnd(element: Element) {
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    act(() => {
      element.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }
}

describe("Crossfade", () => {
  it("shows its content with no motion on the first render", () => {
    const { container } = render(
      <Crossfade contentKey="ok">Everything is working.</Crossfade>,
    );
    expect(screen.getByText("Everything is working.")).toBeInTheDocument();
    expect(container.querySelector("[data-crossfade]")).toBeNull();
  });

  it("fades the new content in over the old, which leaves hidden and then goes", () => {
    const { container, rerender } = render(
      <Crossfade contentKey="ok">Everything is working.</Crossfade>,
    );
    rerender(<Crossfade contentKey="warn">One disk needs you.</Crossfade>);
    const entering = container.querySelector('[data-crossfade="in"]');
    const leaving = container.querySelector('[data-crossfade="out"]');
    expect(entering).toHaveTextContent("One disk needs you.");
    expect(leaving).toHaveTextContent("Everything is working.");
    expect(leaving).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.queryByText("Everything is working.", { ignore: "[aria-hidden]" }),
    ).toBeNull();
    animationEnd(leaving as Element);
    expect(container.querySelector('[data-crossfade="out"]')).toBeNull();
  });

  it("updates in place while the key stays", () => {
    const { container, rerender } = render(
      <Crossfade contentKey="free">290 GiB free</Crossfade>,
    );
    rerender(<Crossfade contentKey="free">288 GiB free</Crossfade>);
    expect(screen.getByText("288 GiB free")).toBeInTheDocument();
    expect(container.querySelector("[data-crossfade]")).toBeNull();
  });

  it("cuts at once under reduced motion when asked to", () => {
    const { container, rerender } = render(
      <MotionScope reduced>
        <Crossfade contentKey="save" reduced="cut">
          Save
        </Crossfade>
      </MotionScope>,
    );
    rerender(
      <MotionScope reduced>
        <Crossfade contentKey="saved" reduced="cut">
          Saved
        </Crossfade>
      </MotionScope>,
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByText("Save")).toBeNull();
    expect(container.querySelector("[data-crossfade]")).toBeNull();
  });

  it("keeps the short fade under reduced motion by default", () => {
    const { container, rerender } = render(
      <MotionScope reduced>
        <Crossfade contentKey="a">Asleep</Crossfade>
      </MotionScope>,
    );
    rerender(
      <MotionScope reduced>
        <Crossfade contentKey="b">Awake</Crossfade>
      </MotionScope>,
    );
    expect(container.querySelector('[data-crossfade="out"]')).not.toBeNull();
  });
});
