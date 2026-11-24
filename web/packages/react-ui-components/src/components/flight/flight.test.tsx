// SPDX-License-Identifier: GPL-3.0-or-later
// The pending flight: a mark made with createElement flies from the control that saved to the pill and
// is removed when it lands; the pill pops when the count rises, after the flight lands. Under reduced
// motion nothing flies and nothing pops.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingPill } from "../pending-pill/pending-pill";
import { flyPendingMark, popElement, whenLanded } from "./flight";

function reducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

/** A stand-in for the Web Animations API, which jsdom lacks; `land()` finishes every animation. */
function stubAnimate() {
  const landings: (() => void)[] = [];
  const animate = vi.fn(
    (_frames: Keyframe[], _options?: KeyframeAnimationOptions) => {
      let land: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        land = resolve;
      });
      landings.push(land);
      return { finished } as unknown as Animation;
    },
  );
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate,
  });
  return {
    animate,
    land: async () => {
      for (const land of landings.splice(0)) {
        land();
      }
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

function box(x: number, y: number) {
  const element = document.createElement("button");
  element.getBoundingClientRect = () =>
    ({
      left: x,
      top: y,
      width: 80,
      height: 32,
      right: x + 80,
      bottom: y + 32,
    }) as DOMRect;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

describe("flyPendingMark", () => {
  it("flies a mark on an arc from the saving control to the pill, and removes it when it lands", async () => {
    reducedMotion(false);
    const { animate, land } = stubAnimate();
    const from = box(400, 600);
    const to = box(900, 12);
    const flight = flyPendingMark(from, to);
    const mark = document.querySelector('[data-slot="pending-flight"]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    // No style attribute in markup: the mark is styled by its classes, moved by the animation.
    expect(mark?.getAttribute("style")).toBeNull();
    const frames = animate.mock.calls[0]![0];
    expect(frames[0]!.transform).toContain("translate(434px, 610px)");
    expect(frames.at(-1)!.transform).toContain("translate(934px, 22px)");
    // The arc rises above both ends.
    const ys = frames.map((f) =>
      Number(/translate\([^,]+, ([-\d.]+)px\)/.exec(String(f.transform))![1]),
    );
    expect(Math.min(...ys)).toBeLessThan(22);
    let landed = false;
    void whenLanded(to).then(() => {
      landed = true;
    });
    await land();
    await expect(flight).resolves.toBe(true);
    expect(landed).toBe(true);
    expect(document.querySelector('[data-slot="pending-flight"]')).toBeNull();
  });

  it("does not run under reduced motion", async () => {
    reducedMotion(true);
    const { animate } = stubAnimate();
    await expect(flyPendingMark(box(0, 0), box(100, 0))).resolves.toBe(false);
    expect(document.querySelector('[data-slot="pending-flight"]')).toBeNull();
    expect(animate).not.toHaveBeenCalled();
    popElement(box(0, 0));
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not run from a control that is not on screen", async () => {
    reducedMotion(false);
    stubAnimate();
    const hidden = document.createElement("button");
    document.body.append(hidden);
    await expect(flyPendingMark(hidden, box(100, 0))).resolves.toBe(false);
  });
});

describe("PendingPill", () => {
  it("turns gold with the count, and pops on the spring when the count rises", async () => {
    reducedMotion(false);
    const { animate } = stubAnimate();
    const { rerender } = render(
      <PendingPill count={0} label="No pending changes" word="pending" />,
    );
    const pill = screen.getByRole("button", { name: "No pending changes" });
    expect(pill).not.toHaveAttribute("data-pending");
    rerender(
      <PendingPill count={2} label="2 pending changes" word="pending" />,
    );
    expect(pill).toHaveAttribute("data-pending");
    expect(pill).toHaveTextContent("2");
    await act(async () => {
      await Promise.resolve();
    });
    expect(animate).toHaveBeenCalledOnce();
    // Falling does not pop.
    rerender(<PendingPill count={1} label="1 pending change" word="pending" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(animate).toHaveBeenCalledOnce();
  });

  it("does not pop under reduced motion; the count and colour still change", async () => {
    reducedMotion(true);
    const { animate } = stubAnimate();
    const { rerender } = render(
      <PendingPill count={0} label="No pending changes" word="pending" />,
    );
    rerender(<PendingPill count={1} label="1 pending change" word="pending" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(animate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "1 pending change" }),
    ).toHaveAttribute("data-pending");
  });
});
