// SPDX-License-Identifier: GPL-3.0-or-later
// A first-time tip as a person meets it: it shows once, "Got it" or its first success ends it for
// good in this browser, it never shows with tips off, and only one shows at a time.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { clearStorage } from "../../../stores/storageSnapshot.ts";
import { hasSeen, useSeenStore } from "../../../stores/useSeenStore.ts";
import { useTipsStore } from "../../../stores/useTipsStore.ts";
import { Tip } from "./Tip.tsx";
import { endTip } from "./tipsContext.ts";
import { TipsProvider } from "./TipsProvider.tsx";

afterEach(() => {
  useTipsStore.setState({ show: true, offered: false });
  useSeenStore.setState({ seen: [] });
  clearStorage();
});

const SAVE_LINE =
  "Saved. Your change waits in the yellow bar until you apply it.";
const TRACE_LINE =
  "Point at a folder, a disk or a way in to see what belongs to it.";

describe("Tip", () => {
  it("shows its line with a Got it that names the tip", () => {
    render(
      <TipsProvider>
        <Tip id="tip.first-save" about="the yellow bar">
          {SAVE_LINE}
        </Tip>
      </TipsProvider>,
    );
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Got it, hide the tip about the yellow bar",
      }),
    ).toBeInTheDocument();
  });

  it("ends for good on Got it", async () => {
    const user = userEvent.setup();
    render(
      <TipsProvider>
        <Tip id="tip.first-save" about="the yellow bar">
          {SAVE_LINE}
        </Tip>
      </TipsProvider>,
    );
    await user.click(screen.getByRole("button", { name: /^Got it/ }));
    expect(hasSeen("tip.first-save")(useSeenStore.getState())).toBe(true);
    await waitFor(() => {
      expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    });
  });

  it("ends on its first success, and does not come back", async () => {
    const { unmount } = render(
      <TipsProvider>
        <Tip id="tip.trace" about="pointing at the map">
          {TRACE_LINE}
        </Tip>
      </TipsProvider>,
    );
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    act(() => {
      endTip("tip.trace");
    });
    await waitFor(() => {
      expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    });
    unmount();
    render(
      <TipsProvider>
        <Tip id="tip.trace" about="pointing at the map">
          {TRACE_LINE}
        </Tip>
      </TipsProvider>,
    );
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });

  it("waits until it has something to explain", () => {
    function Page() {
      const [saved, setSaved] = useState(false);
      return (
        <TipsProvider>
          <button
            type="button"
            onClick={() => {
              setSaved(true);
            }}
          >
            Save
          </button>
          <Tip id="tip.first-save" when={saved} about="the yellow bar">
            {SAVE_LINE}
          </Tip>
        </TipsProvider>
      );
    }
    render(<Page />);
    expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: "Save" }).click();
    });
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
  });

  it("never shows with tips off, from the store or from the provider", () => {
    useTipsStore.setState({ show: false });
    const { unmount } = render(
      <TipsProvider>
        <Tip id="tip.trace" about="pointing at the map">
          {TRACE_LINE}
        </Tip>
      </TipsProvider>,
    );
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    unmount();
    useTipsStore.setState({ show: true });
    render(
      <TipsProvider show={false}>
        <Tip id="tip.trace" about="pointing at the map">
          {TRACE_LINE}
        </Tip>
      </TipsProvider>,
    );
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    // Tips off is not "Got it": the tip is still unseen for when tips come back.
    expect(hasSeen("tip.trace")(useSeenStore.getState())).toBe(false);
  });
});

describe("one tip at a time", () => {
  function Two({ firstWhen = true }: { firstWhen?: boolean }) {
    return (
      <TipsProvider>
        <Tip id="tip.first-save" when={firstWhen} about="the yellow bar">
          {SAVE_LINE}
        </Tip>
        <Tip id="tip.trace" about="pointing at the map">
          {TRACE_LINE}
        </Tip>
      </TipsProvider>
    );
  }

  it("shows the first in reading order, and the next once it has gone", async () => {
    const user = userEvent.setup();
    render(<Two />);
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Got it/ })).toHaveLength(1);

    await user.click(
      screen.getByRole("button", {
        name: "Got it, hide the tip about the yellow bar",
      }),
    );
    await waitFor(() => {
      expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    });
    expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
  });

  it("keeps a tip on screen when an earlier one becomes due, and shows that one next", async () => {
    const { rerender } = render(<Two firstWhen={false} />);
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    rerender(<Two firstWhen />);
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    act(() => {
      endTip("tip.trace");
    });
    await waitFor(() => {
      expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    });
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });

  it("lets a tip that succeeded while waiting end without ever showing", async () => {
    render(<Two />);
    act(() => {
      endTip("tip.trace");
    });
    expect(screen.getByText(SAVE_LINE)).toBeInTheDocument();
    act(() => {
      endTip("tip.first-save");
    });
    await waitFor(() => {
      expect(screen.queryByText(SAVE_LINE)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });
});
