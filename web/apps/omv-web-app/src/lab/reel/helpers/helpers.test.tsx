// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel's four helpers: reduced motion from each of its three sources, FLIP holding the
// order while the pointer or focus is inside and offering the waiting change, drawPath's reduced
// crossfade, and the first-time flag.
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStorage } from "../../../stores/storageSnapshot.ts";
import { useMotionStore } from "../../../stores/useMotionStore.ts";
import { useSeenStore } from "../../../stores/useSeenStore.ts";
import { drawPath } from "./drawPath.ts";
import { MotionScope } from "./MotionScope.tsx";
import { forgetFirstTime, useFirstTime } from "./useFirstTime.ts";
import { heldOrder, useFlip } from "./useFlip.ts";
import { REDUCED_TOKENS, useReducedMotion } from "./useReducedMotion.ts";

type Listener = (event: MediaQueryListEvent) => void;

/** A matchMedia whose reduced-motion answer the test sets, and can change while mounted. */
function mockSystem(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  vi.spyOn(window, "matchMedia").mockImplementation(
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
  useMotionStore.setState({ motion: "full" });
  useSeenStore.setState({ seen: [] });
  clearStorage();
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

  it("follows the Animations preference", () => {
    mockSystem(false);
    const { result } = renderHook(() => useReducedMotion());
    act(() => {
      useMotionStore.getState().setMotion("reduced");
    });
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
    for (const [name, value] of Object.entries(REDUCED_TOKENS)) {
      expect(scope.style.getPropertyValue(name)).toBe(value);
    }
    // The crossfade step stays.
    expect(scope.style.getPropertyValue("--duration-fast")).toBe("");
  });

  it("passes the enclosing state through a scope that is not reduced", () => {
    mockSystem(false);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MotionScope reduced>
        <MotionScope>{children}</MotionScope>
      </MotionScope>
    );
    const { result } = renderHook(() => useReducedMotion(), { wrapper });
    expect(result.current).toBe(true);
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
    place(["a", "b"]);
    const { rerender } = render(<Rows order={["a", "b"]} />);
    place(["b", "a"]);
    rerender(<Rows order={["b", "a"]} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { translate: "0px 40px" },
      { translate: "0 0" },
    ]);

    animate.mockClear();
    useMotionStore.setState({ motion: "reduced" });
    place(["a", "b"]);
    rerender(<Rows order={["a", "b"]} />);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0 },
      { opacity: 1 },
    ]);
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });
});

// ─── drawPath ─────────────────────────────────────────────────────────────────────────────────

function svgPath(scope?: Element): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  (scope ?? document.body).append(path);
  return path as SVGPathElement;
}

describe("drawPath", () => {
  it("draws along the length: dash offset 1 to 0, with the end state kept in the style", async () => {
    mockSystem(false);
    const finished = Promise.resolve();
    const animate = vi.fn(
      (_frames: Keyframe[], _options?: KeyframeAnimationOptions) =>
        ({ finished }) as unknown as Animation,
    );
    const path = svgPath();
    Object.assign(path, { animate });
    await drawPath(path);
    expect(path.getAttribute("pathLength")).toBe("1");
    expect(path.style.getPropertyValue("stroke-dashoffset")).toBe("0");
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0 },
    ]);
    path.remove();
  });

  it("crossfades instead inside a reduced scope", async () => {
    mockSystem(false);
    const scope = document.createElement("div");
    scope.dataset.motion = "reduced";
    document.body.append(scope);
    const finished = Promise.resolve();
    const animate = vi.fn(
      (_frames: Keyframe[], _options?: KeyframeAnimationOptions) =>
        ({ finished }) as unknown as Animation,
    );
    const path = svgPath(scope);
    Object.assign(path, { animate });
    await drawPath(path);
    expect(path.style.getPropertyValue("stroke-dashoffset")).toBe("0");
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { opacity: 0 },
      { opacity: 1 },
    ]);
    scope.remove();
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
    path.remove();
  });
});

// ─── useFirstTime ─────────────────────────────────────────────────────────────────────────────

describe("useFirstTime", () => {
  it("is a first time until done, and again once forgotten", () => {
    const { result } = renderHook(() =>
      useFirstTime("motion.first-pending-flight"),
    );
    expect(result.current.first).toBe(true);
    act(() => {
      result.current.done();
    });
    expect(result.current.first).toBe(false);
    expect(useSeenStore.getState().seen).toEqual([
      "motion.first-pending-flight",
    ]);
    act(() => {
      forgetFirstTime("motion.first-pending-flight");
    });
    expect(result.current.first).toBe(true);
  });

  it("forgets one flag and keeps the others", () => {
    useSeenStore.setState({ seen: ["motion.table-bars", "tip.palette"] });
    forgetFirstTime("motion.table-bars");
    expect(useSeenStore.getState().seen).toEqual(["tip.palette"]);
  });
});
