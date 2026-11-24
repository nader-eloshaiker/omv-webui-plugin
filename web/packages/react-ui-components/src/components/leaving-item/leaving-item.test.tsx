// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeavingItem } from "./leaving-item";
import { useLeavingItems } from "./use-leaving-items";

interface Row {
  id: string;
  title: string;
}

function List({ rows }: { rows: readonly Row[] }) {
  const { entries, left } = useLeavingItems(rows, (row) => row.id);
  return (
    <ul>
      {entries.map((entry) => (
        <LeavingItem
          key={entry.key}
          leaving={entry.leaving}
          onLeft={() => {
            left(entry.key);
          }}
        >
          <div>{entry.item.title}</div>
        </LeavingItem>
      ))}
    </ul>
  );
}

/**
 * jsdom has no AnimationEvent, so React listens for the prefixed name there; the name of the
 * animation is set on a plain event of each kind.
 */
function animationEnd(element: Element, animationName: string) {
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "animationName", { value: animationName });
    act(() => {
      element.dispatchEvent(event);
    });
  }
}

const A = { id: "a", title: "Data is full" };
const B = { id: "b", title: "Disk sdb may fail soon" };
const C = { id: "c", title: "The NAS needs a restart" };

describe("useLeavingItems and LeavingItem", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a leaver in its place, inert, until its exit has run", () => {
    const { rerender } = render(<List rows={[A, B, C]} />);
    rerender(<List rows={[A, C]} />);
    const items = screen.getAllByRole("listitem", { hidden: true });
    expect(items.map((li) => li.textContent)).toEqual([
      A.title,
      B.title,
      C.title,
    ]);
    const leaving = items[1] as HTMLElement;
    expect(leaving).toHaveAttribute("data-leaving");
    expect(leaving).toHaveAttribute("inert");
    expect(leaving.className).toMatch(/data-leaving:animate-leave/);

    animationEnd(leaving, "fade-in");
    expect(screen.getByText(B.title)).toBeInTheDocument();
    animationEnd(leaving, "leave");
    expect(screen.queryByText(B.title)).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("goes after the exit's length when no animationend arrives", () => {
    const { rerender } = render(<List rows={[A, B]} />);
    rerender(<List rows={[B]} />);
    expect(screen.getByText(A.title)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText(A.title)).toBeNull();
  });

  it("ignores the animations of what is inside it", () => {
    const { rerender } = render(<List rows={[A, B]} />);
    rerender(<List rows={[B]} />);
    animationEnd(screen.getByText(A.title), "leave");
    expect(screen.getByText(A.title)).toBeInTheDocument();
  });

  it("keeps an item that comes back while it is leaving", () => {
    const { rerender } = render(<List rows={[A, B]} />);
    rerender(<List rows={[B]} />);
    rerender(<List rows={[A, B]} />);
    const first = screen.getAllByRole("listitem")[0] as HTMLElement;
    expect(first).toHaveTextContent(A.title);
    expect(first).not.toHaveAttribute("data-leaving");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText(A.title)).toBeInTheDocument();
  });

  it("goes at once under reduced motion", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const { rerender } = render(<List rows={[A, B]} />);
      rerender(<List rows={[B]} />);
      expect(screen.queryByText(A.title)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
