// SPDX-License-Identifier: GPL-3.0-or-later
// The motion helpers: reduced motion from each of its three sources, FLIP holding the order while
// the pointer or focus is inside and offering the waiting change, drawPath's reduced crossfade, a
// path that draws only on a change, the first-time flag, and a glide that lands at once when reduced.
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drawPath } from "./draw-path";
import { useGlide } from "./motion";
import { MotionProvider, MotionScope } from "./motion-scope";
import { timeMs } from "./motion-tokens";
import {
  applyReducedMotion,
  REDUCED_MOTION_TOKENS,
  reducedMotionAt,
  useReducedMotion,
} from "./reduced-motion";
import { useDrawPath } from "./use-draw-path";
import { useFirstTime } from "./use-first-time";
import { heldOrder, useFlip } from "./use-flip";

type Listener = (event: MediaQueryListEvent) => void;

/** A matchMedia whose reduced-motion answer the test sets, and can change while mounted. */
function mockSystem(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  // jsdom has no matchMedia: the test provides one.
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        get matches() {
          return query.includes("reduce") && matches;
        },
        media: query,
        addEventListener: (_: string, l: Listener) => listeners.add(l),
        removeEventListener: (_: string, l: Listener) => listeners.delete(l),
      }) as unknown as MediaQueryList,
  );
  return (next: boolean) => {
    matches = next;
    for (const l of listeners) {
      l({ matches: next } as MediaQueryListEvent);
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  document.body.replaceChildren();
});

describe("timeMs", () => {
  it.each([
    ["360ms", 360],
    ["0.36s", 360],
    [" 0ms ", 0],
    ["", null],
    ["fast", null],
  ])("reads %j as %j", (value, ms) => {
    expect(timeMs(value)).toBe(ms);
  });
});

describe("useReducedMotion", () => {
  it("is false with nothing asking for less", () => {
    mockSystem(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("follows the system setting, live", () => {
    const set = mockSystem(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => {
      set(true);
    });
    expect(result.current).toBe(true);
  });

  it("follows the preference the app passes to MotionProvider", () => {
    mockSystem(false);
    let reduced = false;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MotionProvider reduced={reduced}>{children}</MotionProvider>
    );
    const { result, rerender } = renderHook(() => useReducedMotion(), {
      wrapper,
    });
    expect(result.current).toBe(false);
    reduced = true;
    rerender();
    expect(result.current).toBe(true);
  });

  it("is true inside a reduced MotionScope, which carries the attribute and the tokens", () => {
    mockSystem(false);
    function Probe() {
      return <span>{useReducedMotion() ? "reduced" : "full"}</span>;
    }
    const { container } = render(
      <MotionScope reduced className="scope">
        <Probe />
      </MotionScope>,
    );
    expect(screen.getByText("reduced")).toBeInTheDocument();
    const scope = container.querySelector(".scope") as HTMLElement;
    expect(scope).toHaveAttribute("data-motion", "reduced");
    for (const [name, value] of Object.entries(REDUCED_MOTION_TOKENS)) {
      expect(scope.style.getPropertyValue(name)).toBe(value);
    }
    // The crossfade step stays.
    expect(scope.style.getPropertyValue("--duration-fast")).toBe("");
  });

  it("passes the enclosing state through a scope or provider that is not reduced", () => {
    mockSystem(false);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MotionScope reduced>
        <MotionProvider reduced={false}>
          <MotionScope>{children}</MotionScope>
        </MotionProvider>
      </MotionScope>
    );
    const { result } = renderHook(() => useReducedMotion(), { wrapper });
    expect(result.current).toBe(true);
  });

  it("forwards the scope's ref and takes its tokens off when it is no longer reduced", () => {
    mockSystem(false);
    const ref = React.createRef<HTMLDivElement>();
    const { rerender } = render(<MotionScope ref={ref} reduced />);
    expect(ref.current?.style.getPropertyValue("--duration-slow")).toBe("0ms");
    rerender(<MotionScope ref={ref} />);
    expect(ref.current?.style.getPropertyValue("--duration-slow")).toBe("");
    expect(ref.current).not.toHaveAttribute("data-motion");
  });
});

describe("applyReducedMotion and reducedMotionAt", () => {
  it("marks an element and everything in it reduced, and unmarks it", () => {
    mockSystem(false);
    const root = document.createElement("div");
    const inner = document.createElement("span");
    root.append(inner);
    document.body.append(root);
    expect(reducedMotionAt(inner)).toBe(false);
    applyReducedMotion(root, true);
    expect(root.dataset.motion).toBe("reduced");
    expect(root.style.getPropertyValue("--duration-glide")).toBe("0ms");
    expect(reducedMotionAt(inner)).toBe(true);
    applyReducedMotion(root, false);
    expect(root.dataset.motion).toBeUndefined();
    expect(root.style.getPropertyValue("--duration-glide")).toBe("");
    expect(reducedMotionAt(inner)).toBe(false);
  });

  it("follows the system setting wherever the element is", () => {
    mockSystem(true);
    expect(reducedMotionAt(null)).toBe(true);
  });
});

// ─── useFlip ──────────────────────────────────────────────────────────────────────────────────

function Rows({ order }: { order: string[] }) {
  const flip = useFlip(order, (k) => k);
  return (
    <div data-testid="rows" {...flip.containerProps}>
      {flip.waiting ? (
        <button type="button" onClick={flip.release}>
          1 row changed. Show it
        </button>
      ) : null}
      <ol>
        {flip.items.map((k) => (
          <li key={k} data-flip-id={k}>
            <button type="button">{k}</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

const shown = () => screen.getAllByRole("listitem").map((li) => li.textContent);

describe("heldOrder", () => {
  it("keeps what is still there in its old place and puts anything new after it", () => {
    expect(heldOrder(["a", "b", "c"], ["c", "a", "d"])).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
});

describe("useFlip", () => {
  it("reorders at once when nobody is in the list", () => {
    mockSystem(false);
    const { rerender } = render(<Rows order={["sda", "sdb", "sdd"]} />);
    rerender(<Rows order={["sdd", "sda", "sdb"]} />);
    expect(shown()).toEqual(["sdd", "sda", "sdb"]);
    expect(screen.queryByRole("button", { name: /row changed/ })).toBeNull();
  });

  it("holds the order while the pointer is inside and offers the change", async () => {
    mockSystem(false);
    const user = userEvent.setup();
    const { rerender } = render(<Rows order={["sda", "sdb", "sdd"]} />);
    await user.hover(screen.getByTestId("rows"));
    rerender(<Rows order={["sdd", "sda", "sdb"]} />);
    expect(shown()).toEqual(["sda", "sdb", "sdd"]);
    const show = screen.getByRole("button", {
      name: "1 row changed. Show it",
    });
    await user.click(show);
    expect(shown()).toEqual(["sdd", "sda", "sdb"]);
    expect(screen.queryByRole("button", { name: /row changed/ })).toBeNull();
  });

  it("holds the order while focus is inside, and runs the move when focus leaves", async () => {
    mockSystem(false);
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <Rows order={["sda", "sdb", "sdd"]} />
        <button type="button">Elsewhere</button>
      </>,
    );
    screen.getByRole("button", { name: "sdb" }).focus();
    rerender(
      <>
        <Rows order={["sdd", "sda", "sdb"]} />
        <button type="button">Elsewhere</button>
      </>,
    );
    expect(shown()).toEqual(["sda", "sdb", "sdd"]);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(shown()).toEqual(["sdd", "sda", "sdb"]);
  });

  it("moves each row from its old place to its new one, or crossfades under reduced motion", () => {
    const tops: Record<string, number> = {};
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top = tops[this.dataset.flipId ?? ""] ?? 0;
        return { top, left: 0, width: 100, height: 40 } as DOMRect;
      },
    );
    const animate = vi.fn(
      (_frames: Keyframe[], _options?: KeyframeAnimationOptions) =>
        ({
          playState: "running",
          finish: () => undefined,
        }) as unknown as Animation,
    );
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const place = (order: string[]) => {
      order.forEach((k, i) => {
        tops[k] = i * 40;
      });
    };
    mockSystem(false);
    let reduced = false;
    const List = ({ order }: { order: string[] }) => (
      <MotionProvider reduced={reduced}>
        <Rows order={order} />
      </MotionProvider>
    );
    place(["a", "b"]);
    const { rerender } = render(<List order={["a", "b"]} />);
    place(["b", "a"]);
    rerender(<List order={["b", "a"]} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { translate: "0px 40px" },
      { translate: "0 0" },
    ]);

    animate.mockClear();
    reduced = true;
    place(["a", "b"]);
    rerender(<List order={["a", "b"]} />);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0 },
      { opacity: 1 },
    ]);
  });
});

// ─── drawPath and useDrawPath ─────────────────────────────────────────────────────────────────

function svgPath(scope?: Element): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  (scope ?? document.body).append(path);
  return path as SVGPathElement;
}

function stubPathAnimate(path: Element) {
  const finished = Promise.resolve();
  const animate = vi.fn(
    (_frames: Keyframe[], _options?: KeyframeAnimationOptions) =>
      ({ finished, finish: () => undefined }) as unknown as Animation,
  );
  Object.assign(path, { animate });
  return animate;
}

describe("drawPath", () => {
  it("draws along the length: dash offset 1 to 0, with the end state kept in the style", async () => {
    mockSystem(false);
    const path = svgPath();
    const animate = stubPathAnimate(path);
    await drawPath(path);
    expect(path.getAttribute("pathLength")).toBe("1");
    expect(path.style.getPropertyValue("stroke-dashoffset")).toBe("0");
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0 },
    ]);
  });

  it("crossfades instead inside a reduced scope", async () => {
    mockSystem(false);
    const scope = document.createElement("div");
    scope.dataset.motion = "reduced";
    document.body.append(scope);
    const path = svgPath(scope);
    const animate = stubPathAnimate(path);
    await drawPath(path);
    expect(path.style.getPropertyValue("stroke-dashoffset")).toBe("0");
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0 },
      { opacity: 1 },
    ]);
  });

  it("lands at once when the system asks for reduced motion and the fast step is 0", async () => {
    mockSystem(true);
    const path = svgPath();
    path.style.setProperty("--duration-fast", "0ms");
    const animate = vi.fn();
    Object.assign(path, { animate });
    await drawPath(path, { direction: "retract" });
    expect(animate).not.toHaveBeenCalled();
    expect(path.style.getPropertyValue("stroke-dashoffset")).toBe("1");
  });
});

describe("useDrawPath", () => {
  function Check({ on }: { on: boolean }) {
    const ref = useDrawPath(on);
    return (
      <svg>
        <path ref={ref} d="M3 8l3 3 7-7" />
      </svg>
    );
  }

  it("sets the first state without moving, and draws on a change", () => {
    mockSystem(false);
    const animate = vi.fn(
      (_frames: Keyframe[], _options?: KeyframeAnimationOptions) =>
        ({ finished: Promise.resolve() }) as unknown as Animation,
    );
    Object.defineProperty(SVGElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const { container, rerender } = render(<Check on={false} />);
    const path = container.querySelector("path") as SVGPathElement;
    expect(animate).not.toHaveBeenCalled();
    expect(path.style.getPropertyValue("stroke-dashoffset")).toBe("1");
    rerender(<Check on />);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0 },
    ]);
    Reflect.deleteProperty(SVGElement.prototype, "animate");
  });
});

// ─── useFirstTime and useGlide ────────────────────────────────────────────────────────────────

describe("useFirstTime", () => {
  it("is a first time until done, and again once the app forgets the flag", () => {
    let seen = false;
    const markSeen = vi.fn(() => {
      seen = true;
    });
    const { result, rerender } = renderHook(() => useFirstTime(seen, markSeen));
    expect(result.current.first).toBe(true);
    const done = result.current.done;
    act(() => {
      result.current.done();
    });
    rerender();
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(result.current.first).toBe(false);
    // `done` is stable across renders.
    expect(result.current.done).toBe(done);
    seen = false;
    rerender();
    expect(result.current.first).toBe(true);
  });
});

describe("useGlide", () => {
  it("shows a new value at once under the Animations preference", () => {
    mockSystem(false);
    let value = 10;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MotionProvider reduced>{children}</MotionProvider>
    );
    const { result, rerender } = renderHook(() => useGlide(value), {
      wrapper,
    });
    expect(result.current).toBe(10);
    value = 90;
    rerender();
    expect(result.current).toBe(90);
  });
});
