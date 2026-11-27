// SPDX-License-Identifier: GPL-3.0-or-later
// The scan line as a person meets it: a named navigation of one link per area, each named by its
// words in the order they show and then where it goes; status as an icon and a word, never a pill;
// a press scrolls to the part, focuses it without a second scroll and rings it once, again on a
// second press; a modified press is left to the browser.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanAreas } from "../../fixtures/nas-front-fixtures";
import { ScanLine } from "./scan-line";

const nb = (words: string) => words.replace(/\u00a0/gu, " ");

function Page({ checked = false }: { checked?: boolean }) {
  return (
    <>
      <ScanLine label="The NAS at a glance" areas={scanAreas({ checked })} />
      <div id="scan-story-map" tabIndex={-1}>
        Map
      </div>
      <div id="scan-story-disks" tabIndex={-1}>
        Disks
      </div>
    </>
  );
}

let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  // jsdom has no scrollIntoView of its own.
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const flush = () => {
  for (const cb of frames.splice(0)) {
    cb(0);
  }
};

describe("ScanLine", () => {
  it("is a navigation named by its label, one link per area", () => {
    render(<Page />);
    const nav = screen.getByRole("navigation", { name: "The NAS at a glance" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => nb(l.textContent))).toEqual([
      "DisksNot checked6 disks, 1 asleepGo to the disk temperatures",
      "StorageOK4 drives, all with spaceGo to the map of your NAS",
      "SharingOK6 folders, 2 ways in onGo to the ways in",
      "NetworkOKenp2s0 at 1 Gbit/sGo to the network",
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "#scan-story-disks",
      "#scan-story-map",
      "#scan-story-map",
      "#scan-story-map",
    ]);
  });

  it("says each status as its icon and its word in the tone's ink, never a pill", () => {
    render(<Page />);
    const statuses = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector('[data-slot="status-pill"]'));
    expect(statuses.map((s) => s?.getAttribute("data-status"))).toEqual([
      "unknown",
      "ok",
      "ok",
      "ok",
    ]);
    for (const status of statuses) {
      expect(status?.className).not.toMatch(/rounded-full|bg-/u);
      expect(status?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(
      screen.getAllByRole("listitem").map((li) => li.dataset.tone),
    ).toEqual(["unknown", "ok", "ok", "ok"]);
  });

  it("writes its words in sentence case, with no uppercase label", () => {
    const { container } = render(<Page />);
    const classes = [...container.querySelectorAll("*")].map(
      (el) => el.getAttribute("class") ?? "",
    );
    expect(classes.filter((c) => /uppercase|tracking-wide/u.test(c))).toEqual(
      [],
    );
  });

  it("jumps to the part: scrolls there, focuses it without a second scroll and rings it once", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const target = document.getElementById("scan-story-disks");
    if (!target) {
      throw new Error("no target");
    }
    const focus = vi.spyOn(target, "focus");
    await user.click(screen.getByRole("link", { name: /^Disks/u }));
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target).toHaveFocus();
    expect(target).not.toHaveClass("animate-arrive");
    flush();
    expect(target).toHaveClass("animate-arrive");
    // The URL is left alone: the link's default was prevented.
    expect(window.location.hash).toBe("");
  });

  it("plays the ring again on a second press", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const target = document.getElementById("scan-story-map");
    const link = screen.getByRole("link", { name: /^Storage/u });
    await user.click(link);
    flush();
    expect(target).toHaveClass("animate-arrive");
    await user.click(link);
    // Taken off at once, put back on the next frame, so the animation starts over.
    expect(target).not.toHaveClass("animate-arrive");
    flush();
    expect(target).toHaveClass("animate-arrive");
  });

  it("leaves a press with a modifier key to the browser", () => {
    render(<Page />);
    const link = screen.getByRole("link", { name: /^Disks/u });
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    fireEvent(link, event);
    expect(event.defaultPrevented).toBe(false);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("follows the link as usual when its part is not on the page", () => {
    render(
      <ScanLine
        label="The NAS at a glance"
        areas={scanAreas({ checked: true })}
      />,
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: /^Network/u }), event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("merges the caller's class name", () => {
    render(
      <ScanLine
        label="The NAS at a glance"
        areas={scanAreas({ checked: true })}
        className="mt-4"
      />,
    );
    expect(screen.getByRole("navigation")).toHaveClass(
      "mt-4",
      "surface-raised",
    );
  });
});
