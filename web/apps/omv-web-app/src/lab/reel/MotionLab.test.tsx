// SPDX-License-Identifier: GPL-3.0-or-later
// The motion reel as the owner meets it: every entry with its causes and its two panes, the
// Animations switch writing the preference, and the opacity check catching what is still faded.
// Lab fixtures only; nothing here reaches the network.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStorage } from "../../stores/storageSnapshot.ts";
import { useMotionStore } from "../../stores/useMotionStore.ts";
import { useSeenStore } from "../../stores/useSeenStore.ts";
import { checkSentence, fadedIn } from "./check.ts";
import { ENTRIES, LEFT_OUT } from "./entries/index.ts";
import MotionLab from "./MotionLab.tsx";

beforeEach(() => {
  window.history.replaceState(null, "", "/ui/lab?screen=motion");
  // happy-dom lays nothing out; every element has a box, as in a browser.
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    () => [{}] as unknown as DOMRectList,
  );
});

afterEach(() => {
  useMotionStore.setState({ motion: "full" });
  useSeenStore.setState({ seen: [] });
  clearStorage();
  document.documentElement.removeAttribute("data-motion");
});

describe("the motion reel", () => {
  it("shows every entry with its causes, Replay and both panes", () => {
    render(<MotionLab />);
    expect(ENTRIES).toHaveLength(42);
    for (const entry of ENTRIES) {
      const article = screen.getByRole("article", { name: entry.title });
      const panes = within(article);
      const causes = within(panes.getByRole("group", { name: "Causes" }));
      for (const cause of entry.causes) {
        expect(
          causes.getByRole("button", { name: cause.label }),
        ).toBeInTheDocument();
      }
      expect(causes.getByRole("button", { name: "Replay" })).toBeDisabled();
      expect(panes.getByRole("region", { name: "Full" })).toBeInTheDocument();
      expect(
        panes.getByRole("region", { name: "Reduced" }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { level: 2, name: "Left out, and why" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      expect.arrayContaining([...LEFT_OUT]),
    );
  });

  it("writes Reduced to the preference only when the switch is pressed, and the Full pane follows", async () => {
    window.history.replaceState(
      null,
      "",
      "/ui/lab?screen=motion&motion=reduced",
    );
    const user = userEvent.setup();
    render(<MotionLab />);
    // The query seeds what is shown for this visit; it does not write the preference.
    expect(useMotionStore.getState().motion).toBe("full");
    expect(
      screen.getAllByRole("region", { name: "Full (your setting is Reduced)" }),
    ).toHaveLength(ENTRIES.length);

    await user.click(screen.getByRole("radio", { name: "Full" }));
    expect(useMotionStore.getState().motion).toBe("full");
    expect(screen.getAllByRole("region", { name: "Full" })).toHaveLength(
      ENTRIES.length,
    );

    await user.click(screen.getByRole("radio", { name: "Reduced" }));
    expect(useMotionStore.getState().motion).toBe("reduced");
    expect(document.documentElement.dataset.motion).toBe("reduced");
  });

  it("forgets every first time", async () => {
    useSeenStore.setState({ seen: ["motion.table-bars", "tip.palette"] });
    const user = userEvent.setup();
    render(<MotionLab />);
    await user.click(
      screen.getByRole("button", { name: "Forget first times" }),
    );
    expect(useSeenStore.getState().seen).toEqual([]);
  });

  it("runs a cause in both panes and reports the check 400ms later", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MotionLab />);
    const article = screen.getByRole("article", { name: "Live readouts" });
    const panes = within(article);
    expect(panes.getByRole("status")).toHaveTextContent(
      "Press a cause to check it.",
    );
    await user.click(panes.getByRole("button", { name: "Take a reading" }));
    await vi.advanceTimersByTimeAsync(450);
    expect(panes.getByRole("status")).toHaveTextContent(
      "Everything is fully visible 400ms after the cause.",
    );
    expect(panes.getByRole("button", { name: "Replay" })).toBeEnabled();
  });
});

describe("the opacity check", () => {
  /** An element with an inline opacity (set through the CSSOM), its words, and its children. */
  function el(
    tag: string,
    opacity: string | null,
    text: string,
    ...children: HTMLElement[]
  ): HTMLElement {
    const node = document.createElement(tag);
    if (opacity !== null) {
      node.style.setProperty("opacity", opacity);
    }
    node.append(text, ...children);
    return node;
  }

  function pane(...children: HTMLElement[]): HTMLElement {
    const root = el("div", null, "", ...children);
    document.body.append(root);
    return root;
  }

  it("passes when everything shown is fully opaque", () => {
    const root = pane(el("p", null, "Photos"), el("p", "1", "Music"));
    expect(fadedIn(root)).toEqual([]);
    expect(checkSentence([{ pane: "Full", faded: [] }])).toBe(
      "Everything is fully visible 400ms after the cause.",
    );
    root.remove();
  });

  it("reports an element left faded, by its words and its opacity", () => {
    const root = pane(el("div", "0.5", "", el("p", "0.5", "Photos")));
    const faded = fadedIn(root);
    expect(faded.map((f) => f.opacity)).toEqual([0.5, 0.25]);
    expect(checkSentence([{ pane: "Reduced", faded }])).toMatch(
      /^Still faded 400ms after the cause: Reduced: "Photos" \(div\) at 50 %/u,
    );
    root.remove();
  });

  it("ignores what is put away at rest, and what is marked to skip", () => {
    const skipped = el("span", "0.4", "Dimmed");
    skipped.dataset.motionCheck = "skip";
    const root = pane(el("span", "0", "Open"), skipped);
    expect(fadedIn(root)).toEqual([]);
    root.remove();
  });

  it("reports something still on its way in", () => {
    const span = el("span", "0", "Arriving");
    Object.assign(span, {
      getAnimations: () => [{ playState: "running" }],
    });
    const root = pane(span);
    expect(fadedIn(root).map((f) => f.what)).toEqual(['"Arriving" (span)']);
    root.remove();
  });
});
